import { expect, test } from './fixtures'
import type { Page, Request } from '@playwright/test'

function operation(request: Request): { path: string; payload: { edits?: { span_id: string; text: string }[]; scale?: number } } | null {
  const path = new URL(request.url()).pathname.replace(/^\/api/, '')
  if (/\/(render|validate)$/.test(path)) return { path, payload: request.postDataJSON() }
  if (!request.url().endsWith('/api/process')) return null
  const raw = request.postDataBuffer()?.toString('utf8') ?? ''
  const metadata = raw.split('name="operation"\r\n\r\n')[1]?.split('\r\n--')[0]
  if (!metadata) return null
  return JSON.parse(metadata)
}

function renderOperation(request: Request) {
  const value = operation(request)
  return value && /\/pages\/0\/render$/.test(value.path) ? value.payload : null
}

async function rasterInk(page: Page, box: { x: number; y: number; width: number; height: number }) {
  return page.getByAltText('PDF page 1', { exact: true }).evaluate((element, area) => {
    const image = element as HTMLImageElement
    const rect = image.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const ratio = image.naturalWidth / rect.width
    const pixels = context.getImageData(Math.max(0, (area.x - rect.x) * ratio), Math.max(0, (area.y - rect.y) * ratio), area.width * ratio, area.height * ratio).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100) count++
    return count
  }, box)
}

test('finishing an edit never leaves a blank text region while the PDF render is delayed', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await page.getByLabel('Zoom', { exact: true }).selectOption('100')
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  const text = page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })
  const box = (await text.boundingBox())!
  expect(await rasterInk(page, box)).toBeGreaterThan(100)
  await text.click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  await expect(input).toBeVisible()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  let release = () => {}
  const barrier = new Promise<void>(resolve => { release = resolve })
  let waiting = false
  await page.route('**/api/**', async route => {
    const operation = renderOperation(route.request())
    if (operation?.edits?.some(edit => edit.text === 'Great places.')) { waiting = true; await barrier }
    await route.continue()
  })
  try {
    await input.fill('Great places.')
    await input.press('Enter')
    await expect.poll(() => waiting).toBe(true)
    // Text must remain visible as an editing surface or in the PDF pixels.
    // This catches the old handoff that removed both for a network round trip.
    const inSurface = await page.locator('.inline-edit').evaluateAll(elements => elements.some(element =>
      element.querySelector('textarea')?.value === 'Great places.' || element.querySelector('.inline-text-mirror')?.textContent === 'Great places.'))
    expect(inSurface || await rasterInk(page, box) > 100).toBe(true)
  } finally { release() }
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => rasterInk(page, box)).toBeGreaterThan(100)
  await expect(page.getByRole('textbox', { name: 'Edit text on page', exact: true })).toHaveCount(0)
})

test('opening an editor masks the original text until its clean background arrives', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  let release = () => {}
  const barrier = new Promise<void>(resolve => { release = resolve })
  let waiting = false
  await page.route('**/api/**', async route => {
    const value = renderOperation(route.request())
    if (value?.edits?.some(edit => edit.text === '')) { waiting = true; await barrier }
    await route.continue()
  })
  try {
    const original = page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true })
    const box = (await original.boundingBox())!
    await original.click()
    await expect.poll(() => waiting).toBe(true)
    expect(await rasterInk(page, box)).toBeGreaterThan(100)
    const cover = page.locator('.page-stage .inline-source-cover')
    await expect(cover).toBeVisible()
    expect(await cover.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
    const bounds = (await cover.boundingBox())!
    expect(bounds.x).toBeLessThanOrEqual(box.x + 2)
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(box.x + box.width - 2)
    await expect(page.getByRole('textbox', { name: 'Edit text on page', exact: true })).toBeFocused()
  } finally { release() }
  await expect(page.locator('.page-stage .inline-source-cover')).toHaveCount(0)
})

test('a late blur validation cannot close an editor after typing resumes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  let release = () => {}
  const barrier = new Promise<void>(resolve => { release = resolve })
  let waiting = false
  await page.route('**/api/**', async route => {
    const value = operation(route.request())
    if (value?.path.endsWith('/validate') && !waiting) { waiting = true; await barrier }
    await route.continue()
  })
  try {
    await input.fill('New places.')
    await expect.poll(() => waiting).toBe(true)
    await input.evaluate(element => (element as HTMLTextAreaElement).blur())
    await input.fill('Great places.')
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Great places.')
  await input.press('Enter')
  await expect(input).toHaveCount(0)
})

test('properties input remains editable and preserves newer drafts during validation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByLabel('Text content')
  let release = () => {}
  const barrier = new Promise<void>(resolve => { release = resolve })
  let waiting = false
  await page.route('**/api/**', async route => {
    const value = operation(route.request())
    if (value?.path.endsWith('/validate') && !waiting) { waiting = true; await barrier }
    await route.continue()
  })
  try {
    await input.fill('New places.')
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
    await expect.poll(() => waiting).toBe(true)
    await expect(input).toBeEnabled()
    await input.fill('Great places.')
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Edit text: New places.', exact: true })).toBeVisible()
  await expect(input).toHaveValue('Great places.')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
})

test('an unavailable undo during IME composition never removes the active draft', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  await input.fill('Great places.')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Edit text: Great places.', exact: true }).click()
  await input.dispatchEvent('compositionstart', { data: '' })
  await input.fill('New places.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(input).toBeVisible()
  await expect(input).toHaveValue('New places.')
  await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
  await input.dispatchEvent('compositionend', { data: 'New places.' })
  await input.press('Enter')
  await expect(page.getByRole('button', { name: 'Edit text: New places.', exact: true })).toBeVisible()
})

test('rapid selection changes retain the newest target and export exactly one replacement', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  let release = () => {}
  const barrier = new Promise<void>(resolve => { release = resolve })
  let waiting = false
  await page.route('**/api/**', async route => {
    const value = operation(route.request())
    if (value?.path.endsWith('/validate') && !waiting) { waiting = true; await barrier }
    await route.continue()
  })
  try {
    await input.fill('Great places.')
    await expect.poll(() => waiting).toBe(true)
    await page.getByRole('button', { name: 'Edit text: Better everyday.', exact: true }).click()
    await page.getByRole('button', { name: 'Edit text: A field guide to places that bring us together.', exact: true }).click()
  } finally { release() }
  await expect(input).toHaveValue('A field guide to places that bring us together.')
  await expect(input).toBeFocused()
  await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const chunks: Buffer[] = []
  for await (const chunk of await (await pending).createReadStream()) chunks.push(Buffer.from(chunk))
  // An independent extractor checks that the source is removed, rather than
  // trusting the editor's manifest or its optimistic input surface.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loading = getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: true, disableFontFace: true })
  try {
    const document = await loading.promise
    const content = await (await document.getPage(1)).getTextContent()
    const text = content.items.filter(item => 'str' in item).map(item => item.str)
    expect(text.filter(value => value === 'Great places.')).toHaveLength(1)
    expect(text).not.toContain('Good spaces.')
    expect(text).toContain('Better everyday.')
  } finally { await loading.destroy() }
})

test('a failed render preserves the draft handoff and retry recovers it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  let failed = false
  await page.route('**/api/**', async route => {
    const value = renderOperation(route.request())
    if (!failed && value?.edits?.some(edit => edit.text === 'Great places.')) {
      failed = true
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Temporary test interruption' }) })
    } else await route.continue()
  })
  const input = page.getByRole('textbox', { name: 'Edit text on page', exact: true })
  await input.fill('Great places.')
  await input.press('Enter')
  await expect(page.locator('.page-stage .page-error')).toContainText('Temporary test interruption')
  await expect(page.locator('.page-stage .inline-text-mirror')).toHaveText('Great places.')
  await page.locator('.page-stage').getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('.page-stage .page-error')).toHaveCount(0)
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.page-stage .inline-text-mirror')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit text: Great places.', exact: true })).toBeVisible()
})

test('reselecting a text run reuses its rendered background and font resources', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.locator('.home-intro h1 em')).toHaveCSS('font-style', 'normal')
  await expect(page.locator('.home-intro h1')).toHaveCSS('font-family', /Manrope/)
  await page.getByRole('button', { name: 'Try a sample PDF', exact: true }).click()
  await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  const requests: string[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const value = operation(request)
    const path = value?.path ?? new URL(request.url()).pathname
    if (path.includes('inline-style') || path.includes('inline-font') || (path.endsWith('/pages/0/render') && (value?.payload.scale ?? 0) >= 1)) requests.push(path)
    await route.continue()
  })
  const timings = []
  for (let i = 0; i < 3; i++) {
    const started = Date.now()
    await page.getByRole('button', { name: 'Edit text: Good spaces.', exact: true }).click()
    await expect(page.locator('.inline-caption')).toContainText('Times-Roman')
    await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
    timings.push(Date.now() - started)
    await page.getByRole('textbox', { name: 'Edit text on page', exact: true }).press('Enter')
    await expect(page.getByLabel('PDF canvas').locator('.pdf-page')).toHaveAttribute('aria-busy', 'false')
  }
  expect(requests.filter(path => path.includes('inline-style'))).toHaveLength(1)
  expect(requests.filter(path => path.includes('inline-font'))).toHaveLength(0)
  expect(requests.filter(path => path.endsWith('/render'))).toHaveLength(1)
  await testInfo.attach('selection-requests-and-timing', { body: JSON.stringify({ requests, selection_ms_including_automation: timings }), contentType: 'application/json' })
})
