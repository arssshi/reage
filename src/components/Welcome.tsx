import { ArrowUpRight, CircleHelp } from 'lucide-react'
import BrandLogo from './BrandLogo'
import { assetUrl, BASE_URL, GITHUB_URL } from '../config'
import { APP_VERSION } from '../api'
import type { WorkspaceTool } from '../types'

interface Props {
  busy: boolean
  onOpen: () => void
  onDemo: (scanned?: boolean) => void
  onHelp: () => void
  onStartTool: (tool: WorkspaceTool) => void
}

const page = (slug: string) => `${BASE_URL}${slug}/`

export default function Welcome({ busy, onOpen, onDemo, onHelp, onStartTool }: Props) {
  return <div className="seo-shell">
    <a className="seo-skip" href="#workspace">Skip to content</a>
    <header className="seo-header">
      <a className="seo-brand" href={BASE_URL} aria-label="Reage home"><BrandLogo /></a>
      <nav aria-label="Primary navigation"><a href={page('pdf-editor')}>PDF editor</a><a href={page('pdf-font-recovery')}>Font recovery</a><a href={page('ocr-pdf-editor')}>OCR for scans</a><a href={page('guide')}>Guide</a></nav>
      <button className="seo-header-cta" onClick={onOpen} disabled={busy}>Open a PDF <span aria-hidden="true">→</span></button>
    </header>
    <main id="workspace">
      <section className="seo-hero" aria-labelledby="seo-title">
        <div className="seo-hero-copy">
          <p className="seo-eyebrow">OPEN SOURCE · LOCAL FIRST · BUILT FOR WORDS</p>
          <h1 id="seo-title">Edit PDF text online without losing the document’s character.</h1>
          <p className="seo-lede">Reage is a free PDF editor for precise text changes, font recovery, scanned documents, and page organization. Change the words, keep the details, and export a searchable copy.</p>
          <div className="seo-actions"><button className="seo-button primary" onClick={onOpen} disabled={busy}>Open a PDF <span aria-hidden="true">→</span></button><button className="seo-button secondary" onClick={() => onDemo()} disabled={busy}>Explore a sample</button></div>
          <p className="seo-proof"><span>✓</span> No account <span>✓</span> Source PDF stays untouched <span>✓</span> AGPL open source</p>
        </div>
        <div className="seo-hero-media"><picture><source srcSet={assetUrl('/brand/reage-social-card.webp')} type="image/webp" /><img src={assetUrl('/brand/reage-social-card.png')} alt="Reage PDF editor workspace for editing text and recovering fonts" width="1200" height="630" fetchPriority="high" /></picture></div>
      </section>

      <section className="seo-samples" id="seo-samples" aria-labelledby="sample-title"><div><p className="seo-eyebrow">TRY IT WITHOUT UPLOADING YOUR OWN FILE</p><h2 id="sample-title">See the editor in a minute.</h2><p>Explore a native PDF or test local OCR on a scanned page.</p></div><div className="seo-sample-actions"><button className="seo-sample" onClick={() => onDemo()} disabled={busy}><strong>Try a sample PDF</strong><span>Native text · 2 pages <ArrowUpRight size={14} /></span></button><button className="seo-sample" onClick={() => onDemo(true)} disabled={busy}><strong>Try a scanned PDF + OCR</strong><span>Image-based · Local OCR <ArrowUpRight size={14} /></span></button></div></section>

      <section className="seo-section" id="features" aria-labelledby="feature-title"><p className="seo-eyebrow">A PDF editor that respects the page</p><h2 id="feature-title">The useful tools are close to the document.</h2><div className="seo-grid three">
        <button className="seo-card" onClick={() => onStartTool('edit')} disabled={busy}><span className="seo-card-number">01</span><h3>Edit and style PDF text</h3><p>Select a text run, type naturally, apply real bold or italic faces, move it, resize it, and validate the result against the PDF engine.</p><span className="seo-link">Edit PDF text <span aria-hidden="true">→</span></span></button>
        <button className="seo-card" aria-label="Find the right face — recover the font you need" onClick={() => onStartTool('fonts')} disabled={busy}><span className="seo-card-number">02</span><h3>Recover the font you need</h3><p>Font Studio checks glyph coverage, embedded companions, local fonts, bundled faces, and open-font downloads before identifying a substitute.</p><span className="seo-link">Explore font recovery <span aria-hidden="true">→</span></span></button>
        <button className="seo-card" onClick={() => onStartTool('ocr')} disabled={busy}><span className="seo-card-number">03</span><h3>Make scanned PDFs searchable</h3><p>Run browser OCR on image pages, review confidence and typography, or replace a missed visible region without flattening the document.</p><span className="seo-link">Work with scans <span aria-hidden="true">→</span></span></button>
        <button className="seo-card" onClick={() => onStartTool('pages')} disabled={busy}><span className="seo-card-number">04</span><h3>Arrange the final copy</h3><p>Reorder, rotate, duplicate, remove, or extract pages. Add metadata, choose a filename, and optionally subset fonts before download.</p><span className="seo-link">Organize PDF pages <span aria-hidden="true">→</span></span></button>
        <a className="seo-card" href={page('guide')}><span className="seo-card-number">05</span><h3>See what changed</h3><p>Compare the original, inspect font resolution, keep edits undoable, and see honest explanations when a PDF structure needs review.</p><span className="seo-link">Read the editing guide <span aria-hidden="true">→</span></span></a>
        <a className="seo-card" href={page('about')}><span className="seo-card-number">06</span><h3>Use a calmer workspace</h3><p>Reage is document-first, responsive, and built around local processing, transparent limitations, and a source code you can inspect.</p><span className="seo-link">About Reage <span aria-hidden="true">→</span></span></a>
      </div></section>

      <section className="seo-band" aria-labelledby="privacy-title"><div><p className="seo-eyebrow">A practical privacy choice</p><h2 id="privacy-title">Your original file is never overwritten.</h2></div><p>Use the hosted workspace for a temporary session, or run Reage on your own machine. The editor validates a new copy from an immutable source instead of quietly painting over your PDF.</p></section>
      <section className="seo-section narrow" aria-labelledby="steps-title"><p className="seo-eyebrow">A short path from fix to export</p><h2 id="steps-title">How to edit a PDF with Reage</h2><ol className="seo-steps"><li><strong>Open a document.</strong><span>Choose a PDF, try the native sample, or use the scanned sample to explore OCR.</span></li><li><strong>Select the words.</strong><span>Click a text run to type, or choose Add text for a new searchable object.</span></li><li><strong>Check the result.</strong><span>Use formatting, Font Studio, movement handles, Original comparison, and the fidelity report.</span></li><li><strong>Export a copy.</strong><span>Download the full document or arrange only the pages you need.</span></li></ol></section>
      <section className="seo-section narrow" id="faq" aria-labelledby="faq-title"><p className="seo-eyebrow">Questions people ask before editing</p><h2 id="faq-title">Reage PDF editor FAQ</h2><div className="seo-faq"><details><summary>Is Reage a free PDF editor?</summary><p>Yes. Reage is free and open source under AGPL-3.0-or-later. Use the hosted workspace for smaller documents or run the editor locally for larger and more private files.</p></details><details><summary>Can I edit text in a scanned PDF?</summary><p>Yes. Reage can recognize scanned text with browser-based OCR or let you draw a replacement region when OCR misses a line. OCR typography is estimated and should be reviewed.</p></details><details><summary>Does Reage preserve the original PDF?</summary><p>Yes. Reage keeps the source PDF immutable and creates a validated edited copy. Native text edits preserve supported surrounding artwork and untouched pages.</p></details><details><summary>Can Reage recover a missing PDF font?</summary><p>Font Studio checks embedded glyphs, companion faces, installed fonts, bundled fonts, and open-font downloads. If the exact font is unavailable, Reage labels the substitute.</p></details></div></section>
      <section className="seo-author" aria-labelledby="author-title"><div className="seo-author-avatar" aria-hidden="true">r.</div><div><p className="seo-eyebrow">The person behind the project</p><h2 id="author-title">Built in the open by Sameer and contributors.</h2><p>Sameer is the creator and maintainer of Reage, an open-source PDF editor shaped around careful document handling. The project focuses on the small, high-friction changes people actually need: fixing a line, finding a font, recovering a scan, and leaving the rest of the page alone.</p><a className="seo-link" href={page('about')}>Read the project story <span aria-hidden="true">→</span></a></div></section>
    </main>
    <footer className="seo-footer"><span>© 2026 Reage contributors · AGPL-3.0-or-later · v{APP_VERSION}</span><nav aria-label="Footer navigation"><a href={page('about')}>About</a><a href={page('press')}>Press kit</a><a href={page('privacy')}>Privacy</a><a href={GITHUB_URL}>GitHub</a><button onClick={onHelp}><CircleHelp size={13} /> Help</button></nav></footer>
  </div>
}
