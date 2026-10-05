/** Bounded per-tab cache with shared requests and subscriber-aware cancellation. */
export class RequestCache<T> {
  private values = new Map<string, { value: T; size: number }>()
  private pending = new Map<string, { promise: Promise<T>; controller: AbortController; users: number }>()
  private bytes = 0
  private budget: number
  private sizeOf: (value: T) => number
  private limit: number

  constructor(budget: number, sizeOf: (value: T) => number, limit = 48) {
    this.budget = budget; this.sizeOf = sizeOf; this.limit = limit
  }

  private remember(key: string, value: T) {
    const size = this.sizeOf(value)
    if (size > this.budget) return
    const old = this.values.get(key)
    if (old) { this.bytes -= old.size; this.values.delete(key) }
    this.values.set(key, { value, size }); this.bytes += size
    while (this.bytes > this.budget || this.values.size > this.limit) {
      const oldest = this.values.keys().next().value!
      this.bytes -= this.values.get(oldest)!.size
      this.values.delete(oldest)
    }
  }

  seed(key: string, value: T) { this.remember(key, value) }

  clear(prefix = '', cancelPending = true) {
    for (const [key, entry] of this.values) if (key.startsWith(prefix)) { this.bytes -= entry.size; this.values.delete(key) }
    for (const [key, entry] of this.pending) if (key.startsWith(prefix)) { if (cancelPending) entry.controller.abort(); this.pending.delete(key) }
  }

  get(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const aborted = () => new DOMException('Cancelled', 'AbortError')
    if (signal?.aborted) return Promise.reject(aborted())
    const cached = this.values.get(key)
    if (cached) {
      this.values.delete(key); this.values.set(key, cached)
      return Promise.resolve(cached.value)
    }
    let entry = this.pending.get(key)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, users: 0, promise: Promise.resolve().then(() => load(controller.signal)) }
      const owned = entry
      entry.promise = entry.promise.then(value => { if (!controller.signal.aborted && this.pending.get(key) === owned) this.remember(key, value); return value }).finally(() => {
        if (this.pending.get(key) === owned) this.pending.delete(key)
      })
      this.pending.set(key, entry)
    }
    const shared = entry
    shared.users++
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = () => {
        if (finished) return false
        finished = true; shared.users--; signal?.removeEventListener('abort', cancel)
        return true
      }
      const cancel = () => {
        if (!finish()) return
        reject(aborted())
        if (!shared.users && this.pending.get(key) === shared) { this.pending.delete(key); shared.controller.abort() }
      }
      signal?.addEventListener('abort', cancel, { once: true })
      shared.promise.then(value => { if (finish()) resolve(value) }, error => { if (finish()) reject(error) })
    })
  }
}
