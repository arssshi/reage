/** Reage / Warm character. Transparent orange vector masters and brand layouts. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const silhouette = '<path d="M14 77V26c0-2.2 1.8-4 4-4h11c2.2 0 4 1.8 4 4v7c6-9 13-13 24-13h4c2.2 0 4 1.8 4 4v11c0 2.2-1.8 4-4 4h-5c-14 0-23 9-23 24v14c0 2.2-1.8 4-4 4H18c-2.2 0-4-1.8-4-4Z"/><circle cx="76" cy="72" r="9"/>'
const svg = (viewBox, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}">${body}</svg>\n`

export async function generateBrandAssets(root) {
  const folder = resolve(root, 'public/brand')
  const { colors: c } = JSON.parse(await readFile(resolve(folder, 'tokens.json'), 'utf8'))
  const mark = (id, inverse = false, mono = false) => mono ? `<g fill="${c.orange}">${silhouette}</g>` : `
    <defs>
      <clipPath id="${id}-shape">${silhouette}</clipPath>
      <linearGradient id="${id}-base" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${inverse ? '#FFE5CA' : '#FFA966'}"/><stop offset=".48" stop-color="${inverse ? '#FFD09D' : c.tangerine}"/><stop offset="1" stop-color="${inverse ? '#FFAF79' : '#AF3F27'}"/></linearGradient>
      <linearGradient id="${id}-flow" x1=".2" y1="0" x2=".7" y2="1"><stop stop-color="#FFF4DE"/><stop offset=".36" stop-color="${c.amber}"/><stop offset=".72" stop-color="#F99B50"/><stop offset="1" stop-color="#E46B38"/></linearGradient>
      <linearGradient id="${id}-deep" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="${inverse ? '#FFD9B3' : '#DE6A39'}"/><stop offset="1" stop-color="${inverse ? '#F8B078' : '#C14A2C'}"/></linearGradient>
    </defs>
    <g clip-path="url(#${id}-shape)">
      <path d="M0 0H100V100H0Z" fill="url(#${id}-base)"/>
      <path d="M-20 70C11 81 19 14 57 31C78 40 80 15 116 22V110H-20Z" fill="url(#${id}-flow)" opacity=".92"/>
      <path d="M-20 86C18 43 41 103 70 58S107 63 120 70V110H-20Z" fill="url(#${id}-deep)" opacity=".88"/>
      <path d="M-20 70C11 81 19 14 57 31C78 40 80 15 116 22" fill="none" stroke="#FFFFFF" stroke-width=".55" opacity=".55"/>
    </g>`
  const symbol = (id, x, y, size, inverse = false) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100">${mark(id, inverse)}</svg>`
  const rawWord = (await readFile(resolve(folder, 'reage-wordmark.svg'), 'utf8')).match(/<path\b[^>]*\/\>/)[0]
  const wordPath = inverse => rawWord.replace(/fill="[^"]*"/, `fill="${inverse ? c.cream : c.ink}"`)
  const word = (x, y, width, inverse = false) => `<svg x="${x}" y="${y}" width="${width}" height="${width / 3}" viewBox="0 0 132 44">${wordPath(inverse)}</svg>`
  const lockup = (id, inverse = false) => `${symbol(id, -5, -3, 72, inverse)}${word(76, 12, 132, inverse)}`
  const text = (x, y, size, content, color = c.ink, family = 'DM Sans', weight = 400, tracking = 0) => `<text x="${x}" y="${y}" font-family="${family},sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}" fill="${color}">${content}</text>`
  const assets = {
    'reage-mark.svg': svg('0 0 100 100', 'reage — orange fluid lowercase r.', mark('primary')),
    'reage-mark-inverse.svg': svg('0 0 100 100', 'reage — light apricot lowercase r.', mark('inverse', true)),
    'reage-mark-mono.svg': svg('0 0 100 100', 'reage — single-ink ember r.', mark('mono', false, true)),
    'reage-wordmark.svg': svg('0 0 132 44', 'reage — outlined wordmark', wordPath(false)),
    'reage-logo.svg': svg('0 0 216 64', 'reage', lockup('lockup')),
    'reage-logo-inverse.svg': svg('0 0 216 64', 'reage — cream lockup', lockup('lockup-inverse', true)),
    'reage-pattern.svg': svg('0 0 240 240', 'reage — warm fluid contours', `<g fill="none" stroke="${c.orange}" stroke-width=".7" opacity=".22"><path d="M-30 55C45-10 72 125 160 48S235 32 272 65M-30 63C45-2 72 133 160 56S235 40 272 73M-30 175C45 110 72 245 160 168S235 152 272 185M-30 183C45 118 72 253 160 176S235 160 272 193"/></g>`),
  }
  assets['reage-social-card.svg'] = svg('0 0 1200 630', 'reage — Your PDFs. A little more you.', `
    <path d="M0 0H1200V630H0Z" fill="${c.cream}"/>
    <ellipse cx="1010" cy="302" rx="286" ry="339" fill="${c.apricot}"/>
    ${symbol('social-brand', 47, 28, 75)}${word(138, 50, 137)}
    ${text(66, 191, 12, 'A CLEAR SPACE FOR YOUR NEXT IDEA', c.slate, 'DM Sans', 550, 2)}
    ${text(61, 291, 80, 'Your PDFs.', c.ink, 'Manrope', 650, -4)}
    ${text(60, 395, 100, 'A little more you.', c.orange, 'Caveat', 500, -1)}
    <path d="M78 410Q310 430 590 405" fill="none" stroke="${c.amber}" stroke-width="4" stroke-linecap="round"/>
    ${text(66, 471, 20, 'Edit the page. Keep its character.', c.slate)}
    ${text(66, 569, 11, 'LOCAL FIRST   /   FONT AWARE   /   OPEN SOURCE', c.slate, 'DM Sans', 550, 1.3)}
    <circle cx="970" cy="292" r="190" fill="none" stroke="#EFC6A9"/>
    ${symbol('social-fluid', 755, 100, 390)}
    ${text(848, 539, 34, 'Made for your words.', '#AB6748', 'Caveat', 500)}`)

  const swatches = [['Ember', c.orange, c.white], ['Apricot', c.apricot, c.ink], ['Cream', c.cream, c.ink], ['Espresso', c.ink, c.white], ['Sage', c.sage, c.ink], ['Rose', c.rose, c.ink]]
  assets['reage-brand-board.svg'] = svg('0 0 1600 1120', 'reage — Warm character identity system', `
    <path d="M0 0H1600V1120H0Z" fill="${c.cream}"/>
    ${text(64, 65, 13, 'reage / VISUAL IDENTITY', c.slate, 'DM Sans', 550, 2)}${text(1280, 65, 13, 'WARM CHARACTER — 04', c.slate)}
    <rect x="64" y="103" width="920" height="311" rx="22" fill="${c.apricot}"/>
    ${symbol('board-lockup', 94, 120, 112)}${word(218, 150, 160)}
    ${text(112, 297, 46, 'Edit the page.', c.ink, 'Manrope', 650, -1.5)}
    ${text(109, 368, 67, 'Keep its character.', c.orange, 'Caveat', 500, -.5)}
    <path d="M679 270C758 189 807 368 940 252M679 280C758 199 807 378 940 262" fill="none" stroke="#D28C61" stroke-width="1.2" opacity=".55"/>
    <rect x="1008" y="103" width="528" height="311" rx="22" fill="${c.white}" stroke="${c.line}"/>
    ${text(1048, 148, 12, 'THE ORANGE r. / TRANSPARENT VECTOR', c.slate, 'DM Sans', 500, 1.2)}${symbol('board-primary', 1140, 147, 265)}
    ${text(64, 465, 13, '01 / A LITTLE WARMTH. A LOT OF CHARACTER.', c.slate, 'DM Sans', 550, 1.2)}
    ${swatches.map(([name, color, ink], index) => `<rect x="${64 + 248 * index}" y="489" width="232" height="155" rx="14" fill="${color}" stroke="${c.line}"/>${text(86 + 248 * index, 590, 18, name, ink, 'DM Sans', 500)}${text(86 + 248 * index, 620, 12, color, ink)}`).join('')}
    ${text(64, 706, 13, '02 / CLEAR WORDS. A HANDWRITTEN TOUCH.', c.slate, 'DM Sans', 550, 1.2)}${text(924, 706, 13, '03 / EVERY DETAIL, CONSIDERED', c.slate, 'DM Sans', 550, 1.2)}
    <rect x="64" y="734" width="808" height="299" rx="18" fill="${c.white}" stroke="${c.line}"/><rect x="900" y="734" width="636" height="299" rx="18" fill="${c.white}" stroke="${c.line}"/>
    ${text(96, 777, 11, 'MANROPE / DM SANS — HEADINGS &amp; INTERFACE', c.slate, 'DM Sans', 500, .5)}${text(93, 832, 43, 'A clear space to create.', c.ink, 'Manrope', 600, -1.6)}
    ${text(96, 883, 11, 'CAVEAT — A LITTLE MORE YOU', c.slate, 'DM Sans', 500, .5)}${text(91, 950, 60, 'Good things start with a small edit.', c.orange, 'Caveat', 500, -.4)}
    ${text(96, 997, 15, 'Warm surfaces. Useful details. Room for your own character.', c.slate)}
    <rect x="933" y="768" width="156" height="158" rx="15" fill="${c.ink}"/>${symbol('board-inverse', 949, 783, 124, true)}
    ${text(1118, 799, 22, 'One letter. One dot.', c.ink, 'Manrope', 600, -.5)}
    ${text(1118, 838, 16, 'Orange, apricot, and amber.', c.slate)}${text(1118, 870, 16, 'Vector masters + 4K PNGs.', c.slate)}${text(1118, 902, 16, 'Transparent at every size.', c.slate)}
    ${text(937, 983, 29, 'A little more possibility.', c.orange, 'Caveat', 500)}
    ${text(64, 1080, 12, 'WARM. THOUGHTFUL. OPEN BY NATURE.', c.slate, 'DM Sans', 500, 1)}${text(1360, 1080, 12, 'reage / 2026', c.slate)}`)
  for (const [name, content] of Object.entries(assets)) await writeFile(resolve(folder, name), content)
  await writeFile(resolve(root, 'public/favicon.svg'), svg('0 0 100 100', 'reage', mark('favicon')))
}
