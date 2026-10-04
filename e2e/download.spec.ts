import { expect, test } from './fixtures'

test('downloads a real open font, applies it, and reimports the exported PDF', async ({ page, request }) => {
  test.skip(process.env.REAGE_TEST_DOWNLOADS !== '1', 'Enable live public-asset downloads with REAGE_TEST_DOWNLOADS=1')
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  await page.locator('.recovery-toolbar').getByRole('button', { name: 'Font Studio' }).click()
  const studio = page.getByRole('dialog', { name: 'Font Studio' })
  await studio.getByRole('button', { name: 'Get open fonts' }).click()
  await studio.getByLabel('Exact family name').fill('Carlito')
  await studio.getByRole('button', { name: 'Download font', exact: true }).click()
  await expect(studio).not.toBeVisible({ timeout: 90_000 })
  await expect(page.getByLabel('Font family')).toHaveValue(/^font:/)
  await page.getByLabel('Text content').fill('Fresh words.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Fresh words.', exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export PDF/ }).click()
  const download = await pending
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const reopened = await request.post('/api/documents', {
    multipart: { file: { name: 'downloaded-font.pdf', mimeType: 'application/pdf', buffer: Buffer.concat(chunks) } },
  })
  expect(reopened.ok()).toBeTruthy()
  const document = await reopened.json()
  await request.delete(`/api/documents/${document.id}`)
  expect(document.pages[0].spans.some((span: { text: string; font: string }) => span.text === 'Fresh words.' && /Carlito/i.test(span.font))).toBeTruthy()
})
