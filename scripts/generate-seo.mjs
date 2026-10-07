import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const defaultSite = 'https://arssshi.github.io/reage'
const site = (process.env.VITE_SITE_URL || defaultSite).replace(/\/$/, '')
const base = `${(process.env.VITE_BASE_PATH || '/').replace(/^\/?/, '/').replace(/\/?$/, '/')}`
const absolute = slug => `${site}/${slug ? `${slug}/` : ''}`
const href = slug => `${base}${slug ? `${slug}/` : ''}`
const asset = path => `${base}${path.replace(/^\/+/, '')}`

const author = {
  '@type': 'Person',
  name: 'Sameer',
  url: absolute('about'),
  jobTitle: 'Creator and maintainer of Reage',
}

const pages = [
  {
    slug: 'pdf-editor',
    eyebrow: 'PDF EDITOR',
    title: 'Free online PDF editor for precise text changes',
    description: 'Edit PDF text online with Reage. Change words, preserve supported page artwork, recover fonts, and export a searchable copy from a calm open-source workspace.',
    lede: 'Fix a sentence, update a date, or add a note without rebuilding the whole document. Reage keeps editing close to the page and makes the tradeoffs visible.',
    sections: [
      { heading: 'Edit one text run at a time', paragraphs: ['Select native PDF text and type directly on the page. Reage validates the replacement before applying it, keeps undo and redo available, and uses the same PDF engine for the preview and downloaded copy.'], bullets: ['Direct text selection and browser editing', 'Real bold and italic faces, underline, strikethrough, color, opacity, and alignment', 'Move, resize, rotate, and nudge text with collision and overflow checks', 'Original comparison and an applied-edit fidelity report'] },
      { heading: 'A better fit for careful changes', paragraphs: ['A PDF is not a word-processing document. Reage does not promise paragraph reflow where the source file has only positioned glyphs. Instead, it preserves the original source and explains when a structure needs review.'] },
      { heading: 'Start editing', paragraphs: [`Open the <a href="${href('edit-pdf-online')}">online PDF editing guide</a> for a quick walkthrough, or <a href="${href('guide')}">read the complete user guide</a> before working with a complex file.`] },
    ],
    faq: [
      ['Can I edit PDF text online for free?', 'Yes. Reage is free and open source. The hosted workspace is intended for smaller documents; local mode supports larger files and keeps processing on your machine.'],
      ['Will Reage overwrite my original PDF?', 'No. The original PDF stays immutable. Reage exports a separate edited copy after validation.'],
    ],
  },
  {
    slug: 'edit-pdf-online',
    eyebrow: 'EDIT PDF ONLINE',
    title: 'Edit PDF text online without changing the rest of the page',
    description: 'Learn how to edit text in a PDF online with Reage while keeping supported fonts, artwork, links, and untouched pages intact.',
    lede: 'The fastest edit is usually a small one. Reage gives you a direct text surface, a compact formatting bar, and a real PDF preview before export.',
    sections: [
      { heading: 'A simple editing flow', paragraphs: ['Open a PDF, click a text run, type the replacement, and press Enter. The browser draft stays responsive while the service checks glyph coverage, page bounds, and nearby text.'] },
      { heading: 'Format without leaving the page', paragraphs: ['Use the formatting bar for size, color, alignment, bold, italic, underline, and strikethrough. Move text with the handle or arrow keys. Shift constrains a drag to one axis; Alt bypasses snapping guides.'] },
      { heading: 'What is preserved?', paragraphs: ['For supported native text, Reage removes and replaces only the selected text content. It retains surrounding images, vector drawings, links, and untouched pages. Added text is a separate native object and does not paint over source artwork.'] },
      { heading: 'A note about PDF structure', paragraphs: ['Reage edits selectable text runs rather than pretending every PDF is a reflowable document. Paragraph reflow, mixed styles inside a single run, and arbitrary-angle text remain outside the current scope.'] },
    ],
    faq: [
      ['Does online PDF editing require an account?', 'No. The hosted workspace is temporary and does not provide a saved document store or account system.'],
      ['Can I edit a PDF on my phone?', 'The workspace has responsive controls and a mobile properties sheet. Small text edits are usually easiest on a larger screen.'],
    ],
  },
  {
    slug: 'pdf-font-recovery',
    eyebrow: 'FONT RECOVERY',
    title: 'Recover missing PDF fonts with glyph-aware matching',
    description: 'Use Reage Font Studio to inspect embedded PDF fonts, find matching faces, recover missing glyphs, and label substitutes honestly.',
    lede: 'A font name is not the same as a usable font program. Font Studio checks what the PDF actually contains before offering a practical next step.',
    sections: [
      { heading: 'What Font Studio checks', bullets: ['Original embedded font programs and the glyphs stored in a subset', 'Bold, italic, and bold-italic companion faces inside the same PDF', 'Installed local fonts and bundled open-source families', 'Complete public font families available for on-demand download', 'Missing characters before a replacement is validated'] },
      { heading: 'Automatic recovery is explicit', paragraphs: ['Auto tries the original face first, then a complete matching face, then a compatible alternative when needed. Reage records the resolution so a different font cannot silently appear later. A family with a similar name is still labeled as a possible substitute.'] },
      { heading: 'When the exact font is not recoverable', paragraphs: ['A subset PDF may never contain the outline for a new character. A scanned page may not contain a font at all. In both cases, Font Studio explains the limitation and lets you upload the original TTF or OTF when you have it.'] },
    ],
    faq: [
      ['Can a PDF font subset be fully recovered?', 'Not always. A subset contains only the glyphs used in the source document. Reage can reuse those glyphs and look for a complete companion, but it cannot recreate an outline that was never embedded.'],
      ['Does Reage download proprietary fonts?', 'No. Public downloads use open font sources such as Google Fonts. You can upload a font you are licensed to use.'],
    ],
  },
  {
    slug: 'ocr-pdf-editor',
    eyebrow: 'OCR PDF EDITOR',
    title: 'Turn scanned PDF text into editable, searchable content',
    description: 'Edit scanned PDFs with local browser OCR, review recognition confidence, and replace missed text regions without flattening the page.',
    lede: 'Scanned pages are pictures, not text layers. Reage gives you two honest recovery paths: recognize the words locally, or draw around the visible area you need to replace.',
    sections: [
      { heading: 'OCR runs in your browser', paragraphs: ['Tesseract.js recognizes supported languages in a browser worker. You can review the detected line, confidence, estimated font, color, and replacement background before applying it. English and Hindi coverage is included in the tested workflow.'] },
      { heading: 'Use a region when OCR misses', paragraphs: ['Draw around a line or label, type the replacement, and export. Region recovery removes the selected visual area and inserts searchable text while leaving surrounding content alone where the source structure allows it.'] },
      { heading: 'Review the visual tradeoff', paragraphs: ['OCR and region recovery estimate typography and use a solid background color. They do not reconstruct hidden texture behind text on photographs, gradients, or detailed artwork. Visual region replacement is not a security redaction tool.'] },
    ],
    faq: [
      ['Can OCR make a scanned PDF searchable?', 'Yes. Reage registers recognized lines as editable, searchable text regions. The result should still be reviewed for recognition accuracy.'],
      ['Is scanned PDF replacement secure redaction?', 'No. Visual replacement is a reconstruction tool, not a sanitizing redaction workflow. Use a dedicated redaction process for confidential content.'],
    ],
  },
  {
    slug: 'pdf-page-organizer',
    eyebrow: 'PDF PAGE ORGANIZER',
    title: 'Reorder, rotate, duplicate, and extract PDF pages',
    description: 'Arrange PDF pages visually before export with Reage. Reorder, duplicate, rotate, remove, extract ranges, set metadata, and choose a filename.',
    lede: 'Page arrangement belongs at the moment you make the final copy. Reage keeps the workspace anchors tied to source pages while the export dialog controls the downloaded sequence.',
    sections: [
      { heading: 'Build the output sequence you need', bullets: ['Drag page cards or use the arrow controls to reorder', 'Duplicate a page and rotate each output copy independently', 'Remove pages or extract the current page and custom ranges', 'Use descending ranges and repeated page numbers', 'Set a filename, title, author, and optional font subsetting'] },
      { heading: 'Your edits stay attached to source pages', paragraphs: ['An output arrangement does not rewrite the workspace’s page numbering. When you export selected pages, Reage keeps edits on omitted pages marked as ready to export so you do not mistake a partial copy for a complete save.'] },
      { heading: 'Searchable output by default', paragraphs: ['Native text remains searchable after page arrangement. Added text and recovered OCR regions travel with the selected source page and are revalidated through the same export pipeline.'] },
    ],
    faq: [
      ['Can I extract a range of PDF pages?', 'Yes. Choose Current page, All pages, or enter ranges such as 1, 3-5 or 5-3. Repeated page numbers create repeated output copies.'],
      ['Can each duplicated page have a different rotation?', 'Yes. Reage deep-copies repeated pages before applying output rotations so each copy can be independent.'],
    ],
  },
  {
    slug: 'guide',
    eyebrow: 'USER GUIDE',
    title: 'How to edit a PDF with Reage',
    description: 'A practical Reage guide covering PDF text editing, font recovery, OCR scans, page arrangement, privacy, limits, and local setup.',
    lede: 'Start with the smallest change you need. This guide explains the workflow, what Reage can preserve, and where you should review the exported result.',
    sections: [
      { heading: '1. Open the document', paragraphs: ['Choose a PDF or try one of the generated samples. For sensitive or large files, follow the <a href="https://github.com/arssshi/reage#run-locally">local setup instructions</a>.'] },
      { heading: '2. Select, edit, and format', paragraphs: ['Click native text to type in place. Press Enter to finish. Use the formatting bar for common styles and Text properties for font, size, background, position, rotation, and opacity.'] },
      { heading: '3. Recover fonts or scans', paragraphs: ['Open Font Studio when the source font is missing or incomplete. On image pages, use Scan text (OCR) or Replace region, then review the estimated typography and background.'] },
      { heading: '4. Arrange and export', paragraphs: ['Use Export options to organize pages, add metadata, and choose a final filename. Export before closing or refreshing: sessions are temporary and there is no autosaved project store.'] },
    ],
    faq: [
      ['Where does Reage process my PDF?', 'Local mode processes it on your machine. Hosted mode sends self-contained operations to a temporary server and does not maintain a saved document store.'],
      ['What does Reage not support yet?', 'Paragraph reflow, mixed styles within one run, form editing, digital signing, general image/path manipulation, secure redaction, and persistent project files remain roadmap items.'],
    ],
  },
  {
    slug: 'about',
    eyebrow: 'ABOUT REAGE',
    title: 'A calmer way to edit PDF documents',
    description: 'Meet Reage, an open-source PDF editor built for careful text changes, honest font recovery, scanned documents, and privacy-conscious workflows.',
    lede: 'Reage started with a simple frustration: a one-word PDF fix should not require rebuilding the whole file or uploading it to an opaque service.',
    sections: [
      { heading: 'The project idea', paragraphs: ['Reage treats the original PDF as an immutable source. It builds validated edit snapshots, renders previews through the PDF engine, and exports a separate copy. That architecture makes it easier to preserve what the user did not ask to change.'] },
      { heading: 'Open source by design', paragraphs: ['The project is licensed under AGPL-3.0-or-later. The source, capability matrix, implementation notes, and third-party notices are public on <a href="https://github.com/arssshi/reage">GitHub</a>.'] },
      { heading: 'The maintainer', paragraphs: ['Sameer is the creator and maintainer of Reage. The work combines product design, PDF engine experiments, font diagnostics, browser OCR, and regression testing around real document failure modes. Contributions and careful bug reports are welcome.'] },
    ],
    faq: [
      ['Why is Reage open source?', 'PDF editing affects personal and professional documents. An inspectable implementation makes its processing model, limitations, and licensing easier to understand.'],
      ['Is Reage an Adobe Acrobat replacement?', 'Reage is a focused open-source editor for text, fonts, OCR recovery, and page export. It does not claim full Acrobat parity and documents the features still on its roadmap.'],
    ],
  },
  {
    slug: 'privacy',
    eyebrow: 'PRIVACY',
    title: 'Reage privacy: local-first PDF editing',
    description: 'Understand how Reage handles PDF files in local and hosted modes, including temporary processing, font downloads, OCR, and source preservation.',
    lede: 'Choose where processing happens. Reage does not require an account, does not overwrite your original, and does not send your PDF to font or OCR asset providers.',
    sections: [
      { heading: 'Local mode', paragraphs: ['The local edition runs the Python PDF service on loopback. Documents live in bounded, expiring process memory and are removed when you close them or restart the service.'] },
      { heading: 'Hosted mode', paragraphs: ['The hosted editor sends the source PDF and the current edit state with each operation. The stateless service processes the request and returns the result; it does not provide a saved cloud document store.'] },
      { heading: 'Public assets', paragraphs: ['Optional open-font downloads and first-use OCR models use public repositories. Your PDF and rendered page data are not sent to those providers. Font uploads in hosted mode stay scoped to the current browser workspace.'] },
      { heading: 'Read the implementation', paragraphs: ['For exact limits and supported structures, read the <a href="https://github.com/arssshi/reage/blob/main/CAPABILITIES.md">capability matrix</a> and <a href="https://github.com/arssshi/reage/blob/main/IMPLEMENTATION.md">implementation notes</a>.'] },
    ],
    faq: [
      ['Does Reage need an account?', 'No. Reage does not require sign-in or a saved project account.'],
      ['Does Reage send my PDF to Google Fonts?', 'No. Public font providers receive only the requested font asset lookup. The PDF remains with the Reage processing path.'],
    ],
  },
  {
    slug: 'press',
    eyebrow: 'PRESS KIT',
    title: 'Reage press kit and product story',
    description: 'Product facts, story, links, and approved language for writing about Reage, the open-source PDF editor for precise text changes.',
    lede: 'Reage is a free, open-source PDF editor focused on the changes people make most often: fixing text, recovering fonts, editing scans, and arranging a final copy.',
    sections: [
      { heading: 'Short description', paragraphs: ['Reage is a local-first PDF text editor built with React, FastAPI, PyMuPDF, fontTools, and Tesseract.js. It keeps the source PDF immutable, validates edits, and exports a separate searchable copy.'] },
      { heading: 'Why it exists', paragraphs: ['Most PDF editors make small changes feel like a large commitment. Reage focuses on a quieter workflow: select a text run, make the change, inspect the result, and keep the original safe.'] },
      { heading: 'Useful facts', bullets: ['Open source under AGPL-3.0-or-later', 'Local edition for 30 MB / 300 pages; hosted edition for 3 MB / 50 pages', 'Native text editing, font recovery, browser OCR, added text, and page export', 'No account, saved cloud document store, or external AI dependency', 'Public source, capability matrix, guide, and brand assets available on GitHub'] },
      { heading: 'Links and assets', paragraphs: [`<a href="${href('pdf-editor')}">Product overview</a> · <a href="https://github.com/arssshi/reage">Source repository</a> · <a href="${asset('brand/reage-social-card.png')}">Social card</a> · <a href="${asset('brand/BRAND-GUIDE.md')}">Brand guide</a>`] },
    ],
    faq: [],
  },
]

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function organization() {
  return { '@type': 'Organization', '@id': `${site}/#organization`, name: 'Reage', url: `${site}/`, logo: `${site}/brand/reage-logo.svg`, sameAs: ['https://github.com/arssshi/reage'] }
}

function pageSchema(page) {
  const graph = [
    organization(),
    { '@type': 'WebPage', '@id': `${absolute(page.slug)}#webpage`, url: absolute(page.slug), name: page.title, description: page.description, isPartOf: { '@id': `${site}/#website` }, author, inLanguage: 'en' },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` }, { '@type': 'ListItem', position: 2, name: page.title, item: absolute(page.slug) }] },
  ]
  if (page.faq?.length) graph.push({ '@type': 'FAQPage', mainEntity: page.faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) })
  return { '@context': 'https://schema.org', '@graph': graph }
}

function commonHeader() {
  return `<header class="seo-header"><a class="seo-brand" href="${href('')}" aria-label="Reage home"><img src="${asset('brand/reage-logo.svg')}" alt="Reage" width="135" height="40"></a><nav aria-label="Primary navigation"><a href="${href('pdf-editor')}">PDF editor</a><a href="${href('pdf-font-recovery')}">Font recovery</a><a href="${href('ocr-pdf-editor')}">OCR for scans</a><a href="${href('guide')}">Guide</a></nav><a class="seo-header-cta" href="${href('')}">Open a PDF <span aria-hidden="true">→</span></a></header>`
}

function commonFooter() {
  return `<footer class="seo-footer"><span>© 2026 Reage contributors · AGPL-3.0-or-later</span><nav aria-label="Footer navigation"><a href="${href('about')}">About</a><a href="${href('press')}">Press kit</a><a href="${href('privacy')}">Privacy</a><a href="https://github.com/arssshi/reage">GitHub</a></nav></footer>`
}

function sectionHtml(section) {
  return `<section><h2>${section.heading}</h2>${(section.paragraphs || []).map(paragraph => `<p>${paragraph}</p>`).join('')}${section.bullets ? `<ul>${section.bullets.map(item => `<li>${item}</li>`).join('')}</ul>` : ''}</section>`
}

function faqHtml(faq) {
  if (!faq?.length) return ''
  return `<section><h2>Frequently asked questions</h2><div class="seo-faq">${faq.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></section>`
}

function pageHtml(page) {
  const schema = pageSchema(page)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="${asset('favicon.svg')}"><link rel="stylesheet" href="${asset('seo.css')}"><link rel="canonical" href="${absolute(page.slug)}"><meta name="description" content="${page.description}"><meta name="author" content="Sameer and Reage contributors"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="article"><meta property="og:site_name" content="Reage"><meta property="og:url" content="${absolute(page.slug)}"><meta property="og:title" content="${page.title} | Reage"><meta property="og:description" content="${page.description}"><meta property="og:image" content="${site}/brand/reage-social-card.png"><meta property="og:image:alt" content="Reage open-source PDF editor"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${page.title} | Reage"><meta name="twitter:description" content="${page.description}"><meta name="twitter:image" content="${site}/brand/reage-social-card.png"><title>${page.title} | Reage</title><script type="application/ld+json">${jsonLd(schema)}</script></head><body><div class="seo-shell"><a class="seo-skip" href="#content">Skip to content</a>${commonHeader()}<main id="content"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="${href('')}">Home</a></li><li aria-current="page">${page.title}</li></ol></nav><article class="seo-page"><p class="seo-eyebrow">${page.eyebrow}</p><h1>${page.title}</h1><p class="seo-page-lede">${page.lede}</p><div class="seo-cta-row"><a class="seo-button primary" href="${href('')}">Open Reage <span aria-hidden="true">→</span></a><a class="seo-button secondary" href="${href('guide')}">Read the guide</a></div><div class="seo-page-content">${page.sections.map(sectionHtml).join('')}${faqHtml(page.faq)}<section class="seo-author"><div class="seo-author-avatar" aria-hidden="true">r.</div><div><p class="seo-eyebrow">ABOUT THE PROJECT</p><h2>Built in the open by Sameer and contributors.</h2><p>Sameer is the creator and maintainer of Reage, an open-source PDF editor shaped around careful document handling and honest explanations of what a PDF can preserve.</p><a class="seo-link" href="${href('about')}">Read the project story <span aria-hidden="true">→</span></a></div></section></div></article></main>${commonFooter()}</div></body></html>`
}

const indexPath = join(dist, 'index.html')
const index = await readFile(indexPath, 'utf8')
await writeFile(indexPath, index.replaceAll(defaultSite, site))
for (const page of pages) {
  const directory = join(dist, page.slug)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'index.html'), pageHtml(page))
}

const today = new Date().toISOString().slice(0, 10)
const sitemapEntries = ['', ...pages.map(page => page.slug)].map(slug => `<url><loc>${absolute(slug)}</loc><lastmod>${today}</lastmod></url>`).join('')
await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapEntries}</urlset>\n`)
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`)
await writeFile(join(dist, 'humans.txt'), `/* TEAM */\nCreator: Sameer\nProject: Reage PDF Editor\nSource: https://github.com/arssshi/reage\nLicense: AGPL-3.0-or-later\n`)
await writeFile(join(dist, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${asset('seo.css')}"><title>Page not found | Reage</title></head><body><div class="seo-shell"><main class="seo-page" style="width:min(760px,calc(100% - 48px));margin:auto"><p class="seo-eyebrow">404 · PAGE NOT FOUND</p><h1>That page wandered off.</h1><p class="seo-page-lede">The document you were looking for is not here. Reage’s editor and guides are still available from the home page.</p><div class="seo-cta-row"><a class="seo-button primary" href="${href('')}">Back to Reage <span aria-hidden="true">→</span></a></div></main></div></body></html>`)

console.log(`Generated ${pages.length + 1} SEO pages, sitemap.xml, robots.txt, humans.txt, and 404.html for ${site}`)
