import { expect, test } from './fixtures'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

test('on-page selection, typing, Backspace and history survive export and reopen', async ({ page, request }, testInfo) => {
  await page.goto('/')
  const opening = Date.now()
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  const firstPageMs = Date.now() - opening
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  await expect(input).toBeFocused()
  await expect(page.locator('.inline-caption')).toContainText('Times-Roman')
  await input.evaluate(element => {
    const target = element as HTMLTextAreaElement & { frames: number[] }
    target.frames = []
    target.addEventListener('input', () => {
      const start = performance.now()
      requestAnimationFrame(() => target.frames.push(performance.now() - start))
    })
  })
  await input.press('ControlOrMeta+a')
  await input.pressSequentially('Great places!', { delay: 12 })
  await input.press('Backspace')
  await input.pressSequentially('.')
  await expect(input).toHaveValue('Great places.')
  const frames = await input.evaluate(element => (element as HTMLTextAreaElement & { frames: number[] }).frames)
  frames.sort((a, b) => a - b)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  const changed = page.getByRole('button', { name: 'Edit text: Great places.', exact: true })
  await expect(changed).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(changed).toBeVisible()
  const downloading = page.waitForEvent('download')
  const exporting = Date.now()
  await page.getByRole('button', { name: /Export PDF/ }).click()
  const download = await downloading
  const measurements = { fixture: 'Common Ground two-page generated demo', runtime: `${process.platform} ${process.arch}, Node ${process.version}`, browser: page.context().browser()?.version(), first_page_ms_including_automation: firstPageMs, export_ms_including_automation: Date.now() - exporting, input_to_next_animation_frame_ms: { samples: frames.length, p50: frames[Math.floor(frames.length * .5)], p95: frames[Math.floor(frames.length * .95)], max: frames.at(-1) } }
  await download.saveAs(testInfo.outputPath('inline-edited.pdf'))
  await writeFile(testInfo.outputPath('interaction-measurements.json'), JSON.stringify(measurements, null, 2))
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const response = await request.post('/api/documents', { multipart: { file: { name: 'inline-reopened.pdf', mimeType: 'application/pdf', buffer: Buffer.concat(chunks) } } })
  expect(response.ok()).toBeTruthy()
  const document = await response.json()
  await request.delete(`/api/documents/${document.id}`)
  const text = document.pages.flatMap((page: { spans: { text: string }[] }) => page.spans.map(span => span.text))
  expect(text).toContain('Great places.')
  expect(text).not.toContain('Good spaces.')
  // Independent engine: MuPDF does not validate its own output here.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')
  const loading = getDocument({ data: new Uint8Array(Buffer.concat(chunks)),
    standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
    wasmUrl: path.resolve('node_modules/pdfjs-dist/wasm') + '/', useSystemFonts: false })
  const independent = await loading.promise
  try {
    expect(independent.numPages).toBe(2)
    const first = await independent.getPage(1)
    const content = await first.getTextContent()
    expect(content.items.filter(item => 'str' in item).map(item => item.str).join(' ')).toContain('Great places.')
    const viewport = first.getViewport({ scale: 1 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await first.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
    await writeFile(testInfo.outputPath('independent-pdfjs-render.png'), canvas.toBuffer('image/png'))
  } finally { await loading.destroy() }
})

test('the light workspace supports keyboard commands and distraction-free focus mode', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('reage-theme', 'dark'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await page.getByLabel('Zoom', { exact: true }).selectOption('100')
  const paper = page.getByAltText('PDF page 1')
  await expect(paper).toBeVisible()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  const original = await paper.getAttribute('src')
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Text properties' })).not.toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Workspace panels' })).not.toBeVisible()
  expect(await paper.getAttribute('src')).toBe(original)
  await page.screenshot({ path: testInfo.outputPath('focus-workspace.png') })
  await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Text properties' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const command = page.getByRole('combobox', { name: 'Find a command' })
  await command.fill('Find text')
  await command.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Search document' })).toBeFocused()
  await page.getByRole('textbox', { name: 'Search document' }).fill('spaces')
  await expect(page.getByRole('button', { name: /PAGE 1 Good spaces/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('light-workspace.png') })
  await page.getByLabel('Zoom', { exact: true }).selectOption('page')
  await expect(paper).toBeInViewport({ ratio: 1 })
})

test('a delayed validation never overwrites newer keystrokes and immediate export flushes them', async ({ page }) => {
  let release: () => void = () => {}
  const barrier = new Promise<void>(resolve => { release = resolve })
  let delayed = false
  await page.route('**/api/documents/*/validate', async route => {
    if (!delayed) { delayed = true; await barrier }
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  await input.fill('New places.')
  await expect.poll(() => delayed).toBe(true)
  await input.fill('Great places.')
  release()
  await expect(input).toHaveValue('Great places.')
  const exported = page.waitForRequest(request => request.url().endsWith('/export'))
  const download = page.waitForEvent('download')
  await input.press('ControlOrMeta+s')
  const request = await exported
  expect(request.postDataJSON().edits[0].text).toBe('Great places.')
  await download
  await expect(page.getByLabel('Text content')).toHaveValue('Great places.')
})

test('IME composition is not validated mid-composition and failed edits remain recoverable', async ({ page }) => {
  let validations = 0
  page.on('request', request => { if (request.url().endsWith('/validate')) validations++ })
  await page.goto('/')
  await page.getByRole('button', { name: /Try a sample PDF/ }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  await input.dispatchEvent('compositionstart', { data: '' })
  await input.fill('Cafe')
  await page.waitForTimeout(650)
  expect(validations).toBe(0)
  await input.fill('Café places.')
  await input.dispatchEvent('compositionend', { data: 'é' })
  await expect.poll(() => validations).toBe(1)
  await expect(page.getByRole('button', { name: 'Edit text: Café places.', exact: true })).toBeVisible()
  await input.fill('A'.repeat(180))
  await input.press('Enter')
  await expect(page.getByRole('alert')).toContainText(/outside the page|overlap nearby/)
  await expect(input).toHaveValue('A'.repeat(180))
  await expect(page.getByRole('button', { name: 'Edit text: Café places.', exact: true })).toBeVisible()
  await input.fill('Great places.')
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
})
