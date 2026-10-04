import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures'
import type { PdfDocument } from '../src/types'

const fixture = fileURLToPath(new URL('../demo/demo.pdf', import.meta.url))
const target = process.env.REAGE_TEST_URL
const localTarget = !target || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(target).hostname)
test.beforeEach(() => test.skip(!localTarget || !existsSync(fixture), 'The private benchmark runs only on loopback with a locally supplied fixture'))

test('benchmark: native editing preserves the embedded face and makes tiny text accessible', async ({ page, request }, testInfo) => {
  await page.goto('/')
  const imported = page.waitForResponse(response => response.url().endsWith('/api/documents') && response.request().method() === 'POST')
  await page.getByLabel('Choose PDF file').setInputFiles(fixture)
  const source: PdfDocument = await (await imported).json()
  expect(source.pages[0].spans.filter(span => span.font_status !== 'unavailable')).toHaveLength(122)
  await page.getByRole('button', { name: 'Edit text: Address', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom to selection' }).click()
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('300')
  await expect(page.locator('.pdf-page .text-region.selected')).toBeInViewport()
  await page.getByLabel('Font family').selectOption('original')
  await page.getByLabel('Text content').fill('Details')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Details', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: Address', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const download = await pending
  const destination = testInfo.outputPath('benchmark-native-edited.pdf')
  await download.saveAs(destination)
  await page.getByLabel('Choose PDF file').setInputFiles(destination)
  await expect(page.getByRole('button', { name: 'Edit text: Details', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit text: Address', exact: true })).toHaveCount(0)
  // A brand-kit download must also remain usable after a real PDF workflow.
  expect((await request.get('/api/brand-kit')).ok()).toBeTruthy()
})

test('benchmark: Hindi replacement exports logical Unicode', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByLabel('Choose PDF file').setInputFiles(fixture)
  await page.getByRole('button', { name: 'Edit text: पता', exact: true }).click()
  if (process.env.REAGE_TEST_DOWNLOADS === '1') {
    await page.locator('.recovery-toolbar').getByRole('button', { name: 'Font Studio' }).click()
    const studio = page.getByRole('dialog', { name: 'Font Studio' })
    await studio.getByRole('button', { name: 'Get open fonts' }).click()
    await studio.getByLabel('Exact family name').fill('Noto Sans Devanagari')
    await studio.getByRole('button', { name: 'Download font', exact: true }).click()
    await expect(studio).not.toBeVisible({ timeout: 90_000 })
    await page.getByLabel('Font family').selectOption('auto')
  }
  await page.getByLabel('Text content').fill('नाम')
  if (process.env.REAGE_TEST_DOWNLOADS === '1') await expect(page.locator('.font-status')).toContainText('Matching full font found locally')
  await page.getByRole('checkbox', { name: /Fit to original width/ }).check()
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit text: नाम', exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const download = await pending
  const destination = testInfo.outputPath('benchmark-hindi-edited.pdf')
  await download.saveAs(destination)
  await page.getByLabel('Choose PDF file').setInputFiles(destination)
  await expect(page.getByRole('button', { name: 'Edit text: नाम', exact: true })).toBeVisible()
})

test('benchmark: mobile focus keeps small selected text above the properties sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByLabel('Choose PDF file').setInputFiles(fixture)
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit text: Address', exact: true }).click()
  await page.getByRole('button', { name: 'Show text properties' }).click()
  await page.getByRole('button', { name: 'Zoom to selection' }).click()
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('300')
  await expect.poll(async () => {
    const selection = await page.locator('.pdf-page .text-region.selected').boundingBox()
    const sheet = await page.getByRole('complementary', { name: 'Text properties' }).boundingBox()
    return !!selection && !!sheet && selection.y >= 150 && selection.y + selection.height < sheet.y
  }).toBeTruthy()
  await page.getByLabel('Text content').fill('Details')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByText('Changes applied. Preview matches your exported PDF.')).toBeVisible()
})

test('benchmark: bilingual OCR adds image text and keeps existing native content searchable', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.getByLabel('Choose PDF file').setInputFiles(fixture)
  await page.locator('.recovery-toolbar').getByRole('button', { name: 'Scan text (OCR)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Scan text (OCR)' })
  await expect(dialog.getByLabel('OCR language')).toHaveValue('eng+hin')
  const registration = page.waitForResponse(response => /\/pages\/0\/ocr$/.test(response.url()), { timeout: 150_000 })
  await dialog.getByRole('button', { name: 'Recognize text', exact: true }).click()
  const response = await registration
  expect(response.ok()).toBeTruthy()
  const result: { document: PdfDocument; recognized: number } = await response.json()
  expect(result.recognized).toBeGreaterThan(20)
  const target = result.document.pages[0].spans.find(span => span.source === 'ocr' && /unique and secure/i.test(span.text))
  expect(target, 'OCR should find the English sentence inside the information image').toBeTruthy()
  await dialog.getByRole('button', { name: 'Back to editor' }).click()
  await page.getByRole('button', { name: `Edit text: ${target!.text}`, exact: true }).click()
  await page.getByLabel('Text content').fill('Document text is editable.')
  const validation = page.waitForResponse(response => response.url().endsWith('/validate'))
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  const validated = await validation
  expect(validated.ok()).toBeTruthy()
  const changes = await validated.json()
  await expect(page.getByRole('button', { name: 'Edit text: Document text is editable.', exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const download = await pending
  const destination = testInfo.outputPath('benchmark-ocr-edited.pdf')
  await download.saveAs(destination)
  await writeFile(testInfo.outputPath('edited-regions.json'), JSON.stringify([target!.bbox, changes.changes[0].bbox]))
  await page.getByLabel('Choose PDF file').setInputFiles(destination)
  await expect(page.getByRole('button', { name: 'Edit text: Document text is editable.', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit text: Address', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit text: To', exact: true })).toBeVisible()
})
