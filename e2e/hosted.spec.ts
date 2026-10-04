import { expect, test } from './fixtures'

// Only original generated samples are used against public deployments.
test.describe('hosted editor', () => {
  test.setTimeout(120_000)

  test('GitHub and processing disclosure are visible on desktop and mobile', async ({ page, request }) => {
    const health = await request.get('/api/health')
    expect(health.ok()).toBeTruthy()
    expect((await health.json()).mode).toBe('hosted')
    await page.goto('/')
    await expect(page.locator('.service-status')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Reage on GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/arssshi/reage')
    await expect(page.locator('.upload-privacy')).toContainText('sent to our server')
    await expect(page.locator('.upload-footnote')).toContainText('3 MB')
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(page.getByRole('link', { name: 'Reage on GitHub', exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  })

  test('direct typing, undo, export and reopening work without server sessions', async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
    await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 })
    await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
    await expect(page.locator('.inline-caption')).toContainText('Times-Roman', { timeout: 15000 })
    await input.fill('Great places.')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    const downloaded = await pending
    const path = testInfo.outputPath('public-sample-edited.pdf')
    await downloaded.saveAs(path)
    await page.getByLabel('Choose PDF file').setInputFiles(path)
    await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('hosted-editor.png') })
    expect(errors).toEqual([])
  })

  test('OCR recovery persists through render, edit, export and reopen', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await page.goto('/')
    await page.getByRole('button', { name: 'Try a scanned PDF + OCR', exact: true }).click()
    await page.locator('.recovery-toolbar').getByRole('button', { name: 'Scan text (OCR)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Scan text (OCR)' })
    await dialog.getByRole('button', { name: 'Recognize text', exact: true }).click()
    await expect(dialog.getByText(/new editable text regions/)).toBeVisible({ timeout: 150000 })
    await dialog.getByRole('button', { name: 'Back to editor' }).click()
    await page.getByRole('button', { name: 'Edit text: This text started as pixels.', exact: true }).click()
    await page.getByLabel('Text content').fill('Now editable online.')
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit text: Now editable online.', exact: true })).toBeVisible()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    const path = testInfo.outputPath('public-scan-edited.pdf')
    await (await pending).saveAs(path)
    await page.getByLabel('Choose PDF file').setInputFiles(path)
    await expect(page.getByRole('button', { name: 'Edit text: Now editable online.', exact: true })).toBeVisible()
  })

  test('downloaded fonts survive separate serverless operations and export', async ({ page }, testInfo) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
    await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
    await page.locator('.recovery-toolbar').getByRole('button', { name: 'Font Studio' }).click()
    const studio = page.getByRole('dialog', { name: 'Font Studio' })
    await studio.getByRole('button', { name: 'Get open fonts' }).click()
    await studio.getByLabel('Exact family name').fill('Carlito')
    await studio.getByRole('button', { name: 'Download font', exact: true }).click()
    await expect(studio).not.toBeVisible({ timeout: 90000 })
    await expect(page.getByLabel('Font family')).toHaveValue(/^font:/)
    await page.getByLabel('Text content').fill('Fresh words.')
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit text: Fresh words.', exact: true })).toBeVisible()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    const path = testInfo.outputPath('public-font-edited.pdf')
    await (await pending).saveAs(path)
    await page.getByLabel('Choose PDF file').setInputFiles(path)
    await page.getByRole('button', { name: 'Edit text: Fresh words.', exact: true }).click()
    await expect(page.locator('.font-status')).toContainText(/Carlito/)
  })

  test('source and brand downloads include their artwork and licenses', async ({ request }) => {
    for (const [route, expected] of [
      ['source', ['reage/server/cloud.py', 'reage/api/index.py', 'reage/public/font-licenses.txt', 'reage/public/brand/reage-social-card.png']],
      ['brand-kit', ['reage-brand-kit/reage-brand-board.pdf', 'reage-brand-kit/LICENSE', 'reage-brand-kit/font-licenses.txt']],
    ] as const) {
      const response = await request.get(`/api/${route}`)
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('application/zip')
      const archive = await response.body()
      expect(archive.subarray(0, 2).toString()).toBe('PK')
      // ZIP headers retain filenames verbatim, even when entries are compressed.
      for (const name of expected) expect(archive.includes(Buffer.from(name))).toBeTruthy()
    }
  })

  test('oversize uploads are rejected before any document is sent', async ({ page }) => {
    let requests = 0
    page.on('request', request => { if (request.url().endsWith('/api/process')) requests++ })
    await page.goto('/')
    await page.getByLabel('Choose PDF file').setInputFiles({ name: 'too-large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(3 * 1024 * 1024 + 1) })
    await expect(page.locator('.app-error')).toContainText('smaller than 3 MB')
    expect(requests).toBe(0)
  })
})
