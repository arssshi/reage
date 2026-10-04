import { expect, test } from './fixtures'

test('Font Studio diagnoses the PDF and applies a bundled Unicode font', async ({ page, request }, testInfo) => {
  const source = await (await request.post('/api/demo')).json()
  let buffer: Buffer
  try { buffer = await (await request.get(`/api/documents/${source.id}/original`)).body() }
  finally { await request.delete(`/api/documents/${source.id}`) }
  await page.goto('/')
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Find the right face/ }).click()
  await (await choosing).setFiles({ name: 'Font exploration.pdf', mimeType: 'application/pdf', buffer })
  const studio = page.getByRole('dialog', { name: 'Font Studio' })
  await expect(studio).toBeVisible()
  await studio.getByRole('button', { name: 'PDF diagnosis' }).click()
  await expect(studio.locator('.font-report')).toContainText('Times-Roman')
  await page.screenshot({ path: testInfo.outputPath('font-diagnosis.png'), animations: 'disabled' })
  await studio.getByRole('button', { name: 'Close Font Studio' }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  await page.locator('.recovery-toolbar').getByRole('button', { name: 'Font Studio' }).click()
  await studio.getByRole('button', { name: /On this device/ }).click()
  await studio.getByRole('textbox', { name: 'Search fonts' }).fill('Noto Sans')
  await studio.locator('.font-list-item').filter({ hasText: 'Noto Sans' }).first().click()
  await expect(studio).not.toBeVisible()
  await page.getByLabel('Text content').fill('New chapter.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: New chapter.', exact: true })).toBeVisible()
  await expect(page.getByLabel('Font family')).toHaveValue('builtin:notos')
})

test('real local OCR recognizes an image-only PDF, estimates fonts, and exports replacement text', async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) externalRequests.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Try a scanned PDF/ }).click()
  await expect(page.getByText('This page is an image, not a text layer.')).toBeVisible()
  await page.locator('.recovery-toolbar').getByRole('button', { name: 'Scan text (OCR)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Scan text (OCR)' })
  await dialog.getByRole('button', { name: 'Recognize text', exact: true }).click()
  await expect(dialog.getByText(/\d+ new editable text regions/)).toBeVisible({ timeout: 90_000 })
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Back to editor' }).click()
  const line = page.getByRole('button', { name: 'Edit text: This text started as pixels.', exact: true })
  await expect(line).toBeVisible()
  await line.click()
  await expect(page.getByText(/recognition confidence/)).toBeVisible()
  await page.getByLabel('Text content').fill('This text is now editable.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: This text is now editable.', exact: true })).toBeVisible()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  await page.screenshot({ path: testInfo.outputPath('ocr-edited.png') })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export PDF/ }).click()
  const download = await downloadPromise
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const reopened = await request.post('/api/documents', {
    multipart: { file: { name: 'ocr-result.pdf', mimeType: 'application/pdf', buffer: Buffer.concat(chunks) } },
  })
  expect(reopened.ok()).toBeTruthy()
  const result = await reopened.json()
  await request.delete(`/api/documents/${result.id}`)
  expect(result.pages[0].spans.some((span: { text: string }) => span.text === 'This text is now editable.')).toBeTruthy()
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([]) // OCR worker, WASM, and model all use the local app.
})

test('a manual replacement region edits a scan without running OCR', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Try a scanned PDF/ }).click()
  await expect(page.getByAltText('PDF page 1')).toBeVisible()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Replace region', exact: true }).click()
  const box = await page.getByLabel('PDF canvas').locator('.pdf-page').boundingBox()
  if (!box) throw new Error('Page geometry missing')
  await page.mouse.move(box.x + box.width * 0.07, box.y + box.height * 0.69)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.91, box.y + box.height * 0.84, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByLabel('Text content')).toBeVisible()
  await page.getByLabel('Text content').fill('A new line, without OCR.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: A new line, without OCR.', exact: true })).toBeVisible()
})
