import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
const windows = process.platform === 'win32'
const venvPython = resolve(root, windows ? '.venv/Scripts/python.exe' : '.venv/bin/python')
const setup = windows
  ? 'py -m venv .venv\n  .\\.venv\\Scripts\\python -m pip install -r requirements.txt'
  : 'python3 -m venv .venv\n  .venv/bin/python -m pip install -r requirements.txt'

let frontend
let backend
let backendFailure
let running = false
let stopping = false

function portNumber(value, name) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${name} must be a port between 1 and 65535.`)
  }
  return number
}

function findPython() {
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON]]
    : existsSync(venvPython)
      ? [[venvPython]]
      : windows ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']]

  for (const [command, ...args] of candidates) {
    const result = spawnSync(command, [...args, '-c',
      'import json, sys; print(json.dumps({"path": sys.executable, "version": list(sys.version_info[:2])}))',
    ], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
    if (result.error || result.status !== 0) continue
    let python
    try { python = JSON.parse(result.stdout.trim()) } catch { continue }
    if (python.version[0] !== 3 || python.version[1] < 11) continue

    const dependencies = spawnSync(python.path, ['-c',
      'import uvicorn, fastapi, pymupdf, python_multipart, fontTools, PIL, pymupdf_fonts',
    ], { cwd: root, encoding: 'utf8', timeout: 20_000, windowsHide: true })
    if (dependencies.error || dependencies.status !== 0) {
      const detail = dependencies.error?.message || dependencies.stderr.trim()
      throw new Error(`The PDF service's Python dependencies are not ready.\n\n  ${setup}\n\nPython: ${python.path}\n${detail}`)
    }
    return python.path
  }
  throw new Error(`Could not find Python 3.11 or newer${process.env.PYTHON ? ` at PYTHON=${process.env.PYTHON}` : ''}.\nInstall Python, then run:\n\n  ${setup}`)
}

async function serviceAvailable(base) {
  let response
  try {
    response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })
  } catch { return false }
  let body
  try { body = await response.json() } catch { /* Report an occupied non-Reage port below. */ }
  if (response.ok && body?.status === 'ok') {
    let reage = body.service === 'reage'
    // Recognize a Reage server started before the service marker was added.
    try {
      const schema = await fetch(`${base}/api/openapi.json`, { signal: AbortSignal.timeout(1000) })
      if (schema.ok && (await schema.json()).info?.title === 'Reage PDF editor') reage = true
    } catch { /* A generic health response alone does not identify our service. */ }
    if (reage) {
      if (body.version !== version) throw new Error(`An older Reage PDF service (${body.version ?? 'unknown version'}) is still running at ${base}. Stop that service in its original terminal, then run npm run dev again. This interface needs PDF service ${version}.`)
      return true
    }
  }
  throw new Error(`${base} is occupied by another service. Free that API port or set REAGE_API_PORT to a free port.`)
}

async function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  try {
    await frontend?.close()
  } finally {
    // No shell or Uvicorn reloader: the child is the Python server itself,
    // so stopping it also works on Windows without leaving a process tree.
    if (backend && backend.exitCode === null && backend.signalCode === null) {
      const exited = new Promise(resolve => backend.once('exit', resolve))
      backend.kill('SIGTERM')
      let timer
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 4000) })])
      clearTimeout(timer)
      if (backend.exitCode === null && backend.signalCode === null) backend.kill('SIGKILL')
    }
    process.exit(code)
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '5173' },
      strictPort: { type: 'boolean', default: false },
      open: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log('Start the Reage PDF service and Vite together.\n\nnpm run dev -- [--port 5174] [--strictPort] [--open]\n\nOptional environment: PYTHON (executable path), REAGE_API_PORT (default 8000).')
    return
  }
  const port = portNumber(values.port, '--port')
  const apiPort = portNumber(process.env.REAGE_API_PORT ?? '8000', 'REAGE_API_PORT')
  const base = `http://127.0.0.1:${apiPort}`
  if (port === apiPort) throw new Error('The frontend and PDF service must use different ports.')

  console.log('\nReage — starting your local PDF workspace.\n')
  if (await serviceAvailable(base)) {
    console.log(`Using the Reage PDF service already running at ${base}.`)
  } else {
    const python = findPython()
    console.log(`Starting PDF service with ${python}`)
    backend = spawn(python, ['-m', 'uvicorn', process.env.REAGE_HOSTED === '1' ? 'server.cloud:app' : 'server.app:app', '--host', '127.0.0.1', '--port', String(apiPort)], {
      cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONUNBUFFERED: '1' }, windowsHide: true,
    })
    backend.on('error', error => { backendFailure = error })
    backend.on('exit', (code, signal) => {
      backendFailure = new Error(`The PDF service stopped (${signal ?? `exit ${code}`}). See the Python output above.`)
      if (running && !stopping) {
        console.error(`\n${backendFailure.message}`)
        void shutdown(1)
      }
    })
    const deadline = Date.now() + 30_000
    while (true) {
      if (backendFailure) throw backendFailure
      if (await serviceAvailable(base)) break
      if (Date.now() > deadline) throw new Error(`The PDF service did not become ready at ${base}. See the Python output above.`)
      await delay(200)
    }
    console.log(`PDF service ready at ${base}.`)
  }

  if (stopping) return
  frontend = await createServer({
    root,
    server: { host: '127.0.0.1', port, strictPort: values.strictPort, open: values.open },
  })
  await frontend.listen()
  if (backendFailure) throw backendFailure
  running = true
  console.log('\nOpen the Local URL below. Ctrl+C stops the services started by this command.\n')
  frontend.printUrls()
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
main().catch(error => {
  console.error(`\nReage could not start: ${error.message}\n`)
  void shutdown(1)
})
