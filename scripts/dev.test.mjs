import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))

async function reservePort() {
  const server = createTcpServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, port: server.address().port }
}

async function freePort() {
  const { server, port } = await reservePort()
  await new Promise(resolve => server.close(resolve))
  return port
}

function launch(script, args, env) {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {
    cwd: root, env: { ...process.env, ...env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.output = ''
  child.stdout.on('data', chunk => { child.output += stripVTControlCharacters(chunk.toString()) })
  child.stderr.on('data', chunk => { child.output += stripVTControlCharacters(chunk.toString()) })
  return child
}

async function until(check, describe, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await delay(100)
  }
  assert.fail(`Timed out: ${describe()}`)
}

async function uiUrl(child) {
  return until(() => {
    assert.equal(child.exitCode, null, child.output)
    return child.output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)\//)?.[1]
  }, () => `waiting for the UI\n${child.output}`)
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    // Node's child.kill on Windows terminates only the parent process.
    // Keep cleanup confined to this test's own process tree.
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
  await until(() => child.exitCode !== null || child.signalCode !== null,
    () => `stopping test process\n${child.output}`, 10_000)
}

test('combined launcher uploads on a fallback UI port and respects backend ownership', { timeout: 90_000 }, async t => {
  const apiPort = await freePort()
  const occupied = await reservePort()
  t.after(() => new Promise(resolve => occupied.server.close(resolve)))
  const owner = launch('scripts/dev.mjs', ['--port', String(occupied.port)], { REAGE_API_PORT: String(apiPort) })
  t.after(() => stop(owner))
  const base = await uiUrl(owner)
  assert.notEqual(new URL(base).port, String(occupied.port))
  assert.match(owner.output, /PDF service ready/)
  const health = await fetch(`${base}/api/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).service, 'reage')

  const demoResponse = await fetch(`${base}/api/demo`, { method: 'POST', headers: { Origin: base } })
  assert.equal(demoResponse.status, 200)
  const demo = await demoResponse.json()
  const original = await fetch(`${base}/api/documents/${demo.id}/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"edits":[]}',
  })
  assert.equal(original.status, 200)
  const form = new FormData()
  form.append('file', await original.blob(), 'startup-regression.pdf')
  const upload = await fetch(`${base}/api/documents`, { method: 'POST', body: form, headers: { Origin: base } })
  assert.equal(upload.status, 200)
  assert.equal((await upload.json()).page_count, 2)

  const borrower = launch('scripts/dev.mjs', ['--port', String(await freePort()), '--strictPort'], {
    REAGE_API_PORT: String(apiPort),
  })
  t.after(() => stop(borrower))
  await uiUrl(borrower)
  assert.match(borrower.output, /already running/)
  await stop(borrower)
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).status, 200)
  await stop(owner)
  await until(async () => {
    try { await fetch(`http://127.0.0.1:${apiPort}/api/health`); return false } catch { return true }
  }, () => 'the owned PDF service should stop with its launcher', 10_000)
})

test('frontend-only proxy returns actionable JSON when the PDF service is absent', { timeout: 45_000 }, async t => {
  const child = launch('node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', String(await freePort()), '--strictPort'], {
    REAGE_API_PORT: String(await freePort()),
  })
  t.after(() => stop(child))
  const base = await uiUrl(child)
  const form = new FormData()
  form.append('file', new Blob(['%PDF-1.7']), 'example.pdf')
  const response = await fetch(`${base}/api/documents`, { method: 'POST', body: form })
  assert.equal(response.status, 503)
  const error = await response.json()
  assert.equal(error.code, 'pdf_service_unavailable')
  assert.match(error.detail, /npm run dev/)
})

test('missing Python fails before launching a broken UI and prints setup commands', { timeout: 20_000 }, async t => {
  const child = launch('scripts/dev.mjs', [], {
    PYTHON: resolve(root, 'no-such-python'), REAGE_API_PORT: String(await freePort()),
  })
  t.after(() => stop(child))
  await until(() => child.exitCode !== null, () => child.output, 15_000)
  assert.equal(child.exitCode, 1)
  assert.match(child.output, /Could not find Python 3.11/)
  assert.match(child.output, /pip install -r requirements.txt/)
  assert.doesNotMatch(child.output, /Local:/)
})

test('a non-Reage service on the API port is not reused', { timeout: 20_000 }, async t => {
  const unrelated = createHttpServer((_, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end('{"status":"ok","info":{"title":"Another application"}}')
  })
  unrelated.listen(0, '127.0.0.1')
  await once(unrelated, 'listening')
  t.after(() => new Promise(resolve => unrelated.close(resolve)))
  const child = launch('scripts/dev.mjs', [], { REAGE_API_PORT: String(unrelated.address().port) })
  t.after(() => stop(child))
  await until(() => child.exitCode !== null, () => child.output, 15_000)
  assert.equal(child.exitCode, 1)
  assert.match(child.output, /occupied by another service/)
  assert.doesNotMatch(child.output, /Local:/)
})

test('an older Reage backend is rejected instead of serving a mismatched UI', { timeout: 20_000 }, async t => {
  const old = createHttpServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(request.url === '/api/health'
      ? '{"status":"ok","service":"reage","version":"0.1.0"}'
      : '{"info":{"title":"Reage PDF editor"}}')
  })
  old.listen(0, '127.0.0.1')
  await once(old, 'listening')
  t.after(() => new Promise(resolve => old.close(resolve)))
  const child = launch('scripts/dev.mjs', [], { REAGE_API_PORT: String(old.address().port) })
  t.after(() => stop(child))
  await until(() => child.exitCode !== null, () => child.output, 15_000)
  assert.equal(child.exitCode, 1)
  assert.match(child.output, /older Reage PDF service/)
  assert.doesNotMatch(child.output, /Local:/)
})
