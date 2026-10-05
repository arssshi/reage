/** Build the raster counterparts of the editable SVG brand assets. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { generateBrandAssets } from './brand-assets.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
await generateBrandAssets(root)
const require = createRequire(import.meta.url)
const fonts = [
  ['Manrope', '@fontsource-variable/manrope', 'manrope-latin-wght-normal.woff2'],
  ['DM Sans', '@fontsource-variable/dm-sans', 'dm-sans-latin-wght-normal.woff2'],
]
let css = ''
for (const [family, packageName, filename] of fonts) {
  const buffer = await readFile(resolve(dirname(require.resolve(`${packageName}/package.json`)), 'files', filename))
  await writeFile(resolve(root, 'public/brand', filename), buffer)
  css += `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${buffer.toString('base64')}) format('woff2');}`
}

const assets = [
  ['reage-logo.svg', 'reage-logo.png', 2160, 640],
  ['reage-logo-inverse.svg', 'reage-logo-inverse.png', 2160, 640],
  ['reage-mark.svg', 'reage-app-icon-512.png', 512, 512],
  ['reage-mark-inverse.svg', 'reage-avatar-inverse.png', 512, 512],
  ['reage-mark.svg', 'reage-mark.png', 1024, 1024],
  ['reage-mark.svg', 'reage-mark-4k.png', 4096, 4096],
  ['reage-mark-inverse.svg', 'reage-mark-inverse-4k.png', 4096, 4096],
  ['reage-mark-mono.svg', 'reage-mark-mono.png', 512, 512],
  ['reage-wordmark.svg', 'reage-wordmark.png', 1584, 528],
  ['reage-social-card.svg', 'reage-social-card.png', 1200, 630],
  ['reage-social-card.svg', 'reage-social-card@2x.png', 2400, 1260],
  ['reage-brand-board.svg', 'reage-brand-board.png', 1600, 1120],
  ['reage-brand-board.svg', 'reage-brand-board@2x.png', 3200, 2240],
]
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const [source, output, width, height] of assets) {
    const svg = await readFile(resolve(root, 'public/brand', source), 'utf8')
    await page.setViewportSize({ width, height })
    await page.setContent(`<style>${css}html,body{margin:0;width:100%;height:100%;background:transparent}body>svg{display:block;width:100%;height:100%;}</style>${svg}`)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: resolve(root, 'public/brand', output), omitBackground: true })
    if (output === 'reage-brand-board.png') {
      await page.pdf({ path: resolve(root, 'public/brand/reage-brand-board.pdf'), width: `${width}px`, height: `${height}px`, printBackground: true, margin: { top: 0, left: 0, right: 0, bottom: 0 } })
    }
    console.log(`Exported public/brand/${output}`)
  }
  await writeFile(resolve(root, 'public/brand/exports.json'), JSON.stringify(assets.map(([source, file, width, height]) => ({ source, file, width, height, transparent: !file.includes('social-card') && !file.includes('brand-board') })), null, 2) + '\n')
} finally {
  await browser.close()
}
