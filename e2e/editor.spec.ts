import { expect, test } from './fixtures'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('an old running backend is identified before uploading and recovers after restart', async ({ page }) => {
  let outdated = true
  let uploads = 0
  await page.route('**/api/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', service: 'reage', version: outdated ? '0.1.0' : version }),
  }))
  page.on('request', request => { if (request.url().endsWith('/api/documents')) uploads++ })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Service version mismatch')
  await page.getByLabel('Choose PDF file').setInputFiles({ name: 'example.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') })
  await expect(page.locator('.app-error')).toContainText('old Python/Reage server')
  expect(uploads).toBe(0)
  outdated = false
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.locator('.service-status')).toHaveCount(0)
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })).toBeVisible()
})

test('an unavailable backend shows restart instructions instead of a generic 500', async ({ page }) => {
  await page.route('**/api/documents', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'pdf_service_unavailable',
      detail: 'The Python PDF service is not reachable on port 8000. Run npm run dev to start both services.',
    }),
  }))
  await page.goto('/')
  await page.getByLabel('Choose PDF file').setInputFiles({
    name: 'example.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
  })
  await expect(page.getByRole('alert')).toContainText('npm run dev')
  await expect(page.getByRole('alert')).not.toContainText('error (500)')
})

test('edits real PDF text, supports undo/redo, and exports a searchable PDF', async ({ page, request }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Your PDFs/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('welcome.png') })
  await page.screenshot({ path: testInfo.outputPath('welcome-full.png'), fullPage: true })
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  const original = page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })
  await expect(original).toBeVisible()
  await expect(page.getByAltText('PDF page 1')).toBeVisible()
  await original.click()
  await expect(page.getByLabel('Text content')).toHaveValue('Good spaces.')
  await page.getByLabel('Text content').fill('Great places.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  const changed = page.getByRole('button', { name: 'Edit text: Great places.', exact: true })
  await expect(changed).toBeVisible()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  await page.screenshot({ path: testInfo.outputPath('workspace.png') })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(original).toBeVisible()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(changed).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export PDF/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/-edited\.pdf$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const response = await request.post('/api/documents', {
    multipart: { file: { name: 'verified.pdf', mimeType: 'application/pdf', buffer: Buffer.concat(chunks) } },
  })
  expect(response.ok()).toBeTruthy()
  const exported = await response.json()
  await request.delete(`/api/documents/${exported.id}`)
  const text = exported.pages.flatMap((page: { spans: { text: string }[] }) => page.spans.map(span => span.text))
  expect(text).toContain('Great places.')
  expect(text).not.toContain('Good spaces.')
  expect(errors).toEqual([])
})

test('font errors leave the document unchanged, and restoring is undoable', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  await page.getByLabel('Font family').selectOption('original')
  await page.getByLabel('Text content').fill('Hello 🦊')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('does not contain')
  await expect(page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })).toBeVisible()
  await page.getByLabel('Text content').fill('New spaces.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: New spaces.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore original' }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: New spaces.', exact: true })).toBeVisible()
})

test('search finds text on another page and typography changes persist', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await page.getByRole('button', { name: 'Find text', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search document' }).fill('listening')
  await page.getByRole('button', { name: /PAGE 2 Start with listening/ }).click()
  await expect(page.getByLabel('Current page')).toHaveValue('1')
  await expect(page.getByLabel('Text content')).toHaveValue('Start with listening.')
  await page.getByLabel('Font size').fill('20')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByText('Changes applied. Preview matches your exported PDF.')).toBeVisible()
  await page.getByRole('button', { name: 'Deselect text' }).click()
  await page.getByRole('button', { name: 'Edit text: Start with listening.', exact: true }).click()
  await expect(page.getByLabel('Font size')).toHaveValue('20')
})

test('small-screen workspace can open and edit a PDF', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Your PDFs/ })).toBeVisible()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    for (const button of await page.getByRole('button', { name: /Open a PDF|Try a.*PDF/ }).all()) {
      await expect(button).toBeInViewport({ ratio: 1 })
    }
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-welcome.png'), fullPage: true })
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Edit text on page', exact: true })).toBeFocused()
  await expect(page.getByLabel('Text content')).not.toBeVisible()
  await page.getByRole('button', { name: 'Show text properties' }).click()
  await expect(page.getByLabel('Text content')).toBeVisible()
  await page.getByLabel('Text content').fill('New places.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByText('Changes applied. Preview matches your exported PDF.')).toBeVisible()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), animations: 'disabled' })
})
