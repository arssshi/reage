import assert from 'node:assert/strict'
import test from 'node:test'
import { RequestCache } from '../src/requestCache.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('one cancelled subscriber cannot abort another reader of the same render', async () => {
  const cache = new RequestCache(16, value => value.length)
  const pending = deferred()
  const first = new AbortController()
  let calls = 0, sharedSignal
  const load = signal => { calls++; sharedSignal = signal; return pending.promise }
  const a = cache.get('page', load, first.signal)
  const b = cache.get('page', load)
  await Promise.resolve()
  first.abort()
  await assert.rejects(a, { name: 'AbortError' })
  assert.equal(sharedSignal.aborted, false)
  pending.resolve('pixels')
  assert.equal(await b, 'pixels')
  assert.equal(await cache.get('page', load), 'pixels')
  assert.equal(calls, 1)
})

test('an abandoned late request never replaces the newest cached response', async () => {
  const cache = new RequestCache(16, value => value.length)
  const old = deferred()
  const reader = new AbortController()
  let oldSignal
  const abandoned = cache.get('page', signal => { oldSignal = signal; return old.promise }, reader.signal)
  await Promise.resolve()
  reader.abort()
  await assert.rejects(abandoned, { name: 'AbortError' })
  assert.equal(oldSignal.aborted, true)
  assert.equal(await cache.get('page', async () => 'new'), 'new')
  old.resolve('old')
  await old.promise
  assert.equal(await cache.get('page', async () => { throw new Error('unexpected network request') }), 'new')
})

test('invalidating a document prevents late repopulation without disrupting readers', async () => {
  const cache = new RequestCache(16, value => value.length)
  const pending = deferred()
  let signal
  const existing = cache.get('document:page', control => { signal = control; return pending.promise })
  await Promise.resolve()
  cache.seed('other:page', 'safe')
  cache.clear('document:', false)
  assert.equal(signal.aborted, false)
  pending.resolve('outdated')
  assert.equal(await existing, 'outdated')
  assert.equal(await cache.get('document:page', async () => 'fresh'), 'fresh')
  assert.equal(await cache.get('other:page', async () => { throw new Error('unexpected load') }), 'safe')
})

test('LRU eviction respects the byte budget and entries that are too large', async () => {
  const cache = new RequestCache(6, value => value.length, 3)
  cache.seed('a', 'aaa'); cache.seed('b', 'bbb')
  assert.equal(await cache.get('a', async () => 'bad'), 'aaa')
  cache.seed('c', 'ccc')
  let calls = 0
  const load = async () => { calls++; return 'bbb' }
  assert.equal(await cache.get('b', load), 'bbb')
  assert.equal(calls, 1)
  for (let i = 0; i < 2; i++) assert.equal(await cache.get('large', async () => { calls++; return '1234567' }), '1234567')
  assert.equal(calls, 3)
})

test('failed and aborted requests can be retried, and close cancels pending work', async () => {
  const cache = new RequestCache(16, value => value.length)
  await assert.rejects(cache.get('retry', async () => { throw new Error('offline') }), /offline/)
  assert.equal(await cache.get('retry', async () => 'recovered'), 'recovered')
  const pending = cache.get('close:page', signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))
  }))
  await Promise.resolve()
  cache.clear('close:')
  await assert.rejects(pending, { name: 'AbortError' })
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(cache.get('retry', async () => 'bad', aborted.signal), { name: 'AbortError' })
})
