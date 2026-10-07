import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { join } from 'node:path'

const root = new URL('../dist/', import.meta.url)
const pages = ['', 'pdf-editor', 'edit-pdf-online', 'pdf-font-recovery', 'ocr-pdf-editor', 'pdf-page-organizer', 'guide', 'about', 'privacy', 'press']
const html = slug => readFile(new URL(`${slug ? `${slug}/` : ''}index.html`, root), 'utf8')

test('the build emits every crawlable SEO page with one indexable H1 and canonical URL', async () => {
  for (const slug of pages) {
    const document = await html(slug)
    assert.equal((document.match(/<h1\b/gi) ?? []).length, 1, slug || 'home')
    assert.match(document, /<link rel="canonical" href="https:\/\//)
    assert.doesNotMatch(document.toLowerCase(), /noindex|nofollow|disallow/)
    assert.match(document, /application\/ld\+json/)
  }
})

test('the build emits crawl controls and a useful not-found page', async () => {
  const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8')
  const robots = await readFile(new URL('robots.txt', root), 'utf8')
  await access(new URL('404.html', root))
  for (const slug of pages) assert.ok(sitemap.includes(`https://arssshi.github.io/reage/${slug ? `${slug}/` : ''}`), slug || 'home')
  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /Allow: \/\n/)
  assert.doesNotMatch(robots, /Disallow:/)
})

test('the home page exposes stable image dimensions and visible FAQ content', async () => {
  const document = await html('')
  assert.match(document, /<img[^>]+alt="Reage PDF editor workspace[^>]+width="1200"[^>]+height="630"/)
  assert.match(document, /Reage PDF editor FAQ/)
  assert.match(document, /"@type":"FAQPage"|"@type": "FAQPage"/)
})
