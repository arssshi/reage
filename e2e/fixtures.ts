import { test as base, expect, type Response } from '@playwright/test'

// Tests can run against the user's live service. Release only sessions created
// by this test; never clear the server's store or touch another browser's PDF.
export const test = base.extend<{ documentCleanup: void }>({
  documentCleanup: [async ({ page, request }, use) => {
    const documents = new Set<string>()
    const pending: Promise<void>[] = []
    const track = (response: Response) => {
      if (response.request().method() !== 'POST' || !response.ok() || !/^\/api\/(documents|demo(?:\/scanned)?)$/.test(new URL(response.url()).pathname)) return
      pending.push(response.json().then(body => { if (typeof body.id === 'string') documents.add(body.id) }).catch(() => {}))
    }
    page.on('response', track)
    try { await use() } finally {
      page.off('response', track)
      await Promise.all(pending)
      for (const id of documents) await request.delete(`/api/documents/${id}`)
    }
  }, { auto: true }],
})

export { expect }
