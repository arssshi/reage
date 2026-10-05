import { useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Github, FileText, Fingerprint, LayoutGrid, LockKeyhole, ScanText, Search, ShieldCheck, TextCursorInput, Type, Upload, WandSparkles } from 'lucide-react'
import BrandLogo from './BrandLogo'
import { APP_VERSION } from '../api'
import type { WorkspaceTool } from '../types'
import { GITHUB_URL, IS_HOSTED, MAX_UPLOAD_MB, PRIVACY_COPY } from '../config'

interface Props {
  busy: boolean
  onOpen: () => void
  onDemo: (scanned?: boolean) => void
  onHelp: () => void
  onStartTool: (tool: WorkspaceTool) => void
}

export default function Welcome({ busy, onOpen, onDemo, onHelp, onStartTool }: Props) {
  const [section, setSection] = useState('workspace')
  return <div className="home-shell">
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <aside className="home-sidebar">
      <a className="brand" href="/" aria-label="Reage home"><BrandLogo /></a>
      <span className="sidebar-caption">YOUR PDF WORKSPACE</span>
      <nav aria-label="Main navigation">
        <a href="#workspace" className={section === 'workspace' ? 'active' : ''} onClick={() => setSection('workspace')}><LayoutGrid size={19} /><span>Your workspace</span><span className="nav-dot" /></a>
        <a href="#tools" className={section === 'tools' ? 'active' : ''} onClick={() => setSection('tools')}><WandSparkles size={19} /><span>Explore tools</span><ChevronRight size={15} /></a>
      </nav>
      <div className="sidebar-guide"><span className="guide-symbol"><TextCursorInput size={23} /></span><h3>Small edits.<br />Same character.</h3><p>Keep the details that make your document yours.</p><button onClick={onHelp}>A quick introduction <ArrowUpRight size={14} /></button></div>
      <div className="sidebar-bottom-links"><button onClick={onHelp}><CircleHelp size={18} /> Help & shortcuts</button><a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={18} /> View on GitHub <ArrowUpRight size={13} /></a><div className="local-label"><span /> {IS_HOSTED ? 'Online workspace' : 'Local workspace'} <span>v{APP_VERSION}</span></div></div>
    </aside>

    <div className="home-content">
      <header className="home-topbar"><span className="home-breadcrumb">Workspace <ChevronRight size={14} /><strong>Overview</strong></span><a className="brand mobile-home-brand" href="/" aria-label="Reage home"><BrandLogo /></a><div><span className="privacy-pill"><LockKeyhole size={13} /> {IS_HOSTED ? 'No saved documents' : 'Private by design'}</span><a className="github-link" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Reage on GitHub"><Github size={17} /> GitHub <ArrowUpRight size={13} /></a><button className="icon-button" onClick={onHelp} aria-label="Help & shortcuts"><CircleHelp size={19} /></button></div></header>
      <main id="workspace" className="home-main">
        <div className="home-intro"><div><span className="eyebrow">PRECISE EDITS. ORIGINAL CHARACTER.</span><h1>Your PDFs.<br /><em>Precisely edited.</em></h1><p>Edit text, recover fonts, and export a searchable PDF.</p></div><div className="intro-note"><span>Native PDF editing.<br />Open source. No subscription.</span></div></div>

        <div className="home-start-grid">
          <section className="upload-panel" aria-labelledby="upload-title">
            <div className="upload-card-top"><span><span className="status-dot" /> READY WHEN YOU ARE</span><span>01 / OPEN</span></div>
            <div className="paper-stack" aria-hidden="true"><div className="stack-paper back" /><div className="stack-paper front"><span className="paper-fold" /><span className="paper-aa">Aa<span>|</span></span><i /><i /><span className="paper-label">YOUR NEXT CHAPTER</span></div><span className="stack-badge"><Check size={16} /></span><span className="stack-spark">+</span></div>
            <h2 id="upload-title">Open a PDF to get started.</h2><p>Drag your PDF here, or choose a file below.</p>
            <button className="button primary upload-primary" onClick={onOpen} disabled={busy} aria-label="Open a PDF"><Upload size={17} /> Choose a PDF <ArrowRight size={17} /></button>
            <span className="upload-footnote">PDF files up to {MAX_UPLOAD_MB} MB <span>·</span> No account needed</span>
            {IS_HOSTED && <p className="upload-privacy">{PRIVACY_COPY} <a href={`${GITHUB_URL}#run-locally`} target="_blank" rel="noreferrer">Local setup ↗</a></p>}
          </section>

          <section className="sample-panel" aria-labelledby="sample-title"><div className="section-label">TAKE A LOOK AROUND <span>↗</span></div><h2 id="sample-title">Just exploring?</h2><p>Try an example. Make a few changes.<br />See how it feels.</p>
            <button className="sample-document" onClick={() => onDemo()} disabled={busy} aria-label="Try a sample PDF"><span className="sample-cover mint"><span>FIELD<br />NOTES</span><i /><i /><small>01—02</small></span><span className="sample-info"><strong>A document to play with</strong><small>Native text · 2 pages</small><span>Try a sample PDF <ArrowUpRight size={14} /></span></span></button>
            <button className="sample-document" onClick={() => onDemo(true)} disabled={busy} aria-label="Try a scanned PDF + OCR"><span className="sample-cover lavender"><ScanText size={26} strokeWidth={1.3} /><i /><i /><small>SCAN / 01</small></span><span className="sample-info"><strong>Find words in a scan</strong><small>Image-based · Local OCR</small><span>Try a scanned PDF <ArrowUpRight size={14} /></span></span></button>
            <span className="sample-hint"><Fingerprint size={15} /> Your originals stay original.</span>
          </section>
        </div>

        <section id="tools" className="home-tools" aria-labelledby="tools-title"><div className="home-section-heading"><div><span className="eyebrow">WHAT WOULD YOU LIKE TO DO?</span><h2 id="tools-title">A few good tools. A lot of possibility.</h2></div><span>Choose a tool, then open your PDF.</span></div><div className="home-tool-grid">
          <button className="home-tool-card" onClick={() => onStartTool('edit')} disabled={busy}><span className="tool-card-icon peach"><TextCursorInput size={23} /></span><ArrowUpRight className="tool-card-arrow" size={18} /><h3>Edit the words</h3><p>Click existing text and type.<br />Keep the page’s character.</p><span className="tool-card-link">Edit text <ArrowRight size={13} /></span></button>
          <button className="home-tool-card" onClick={() => onStartTool('ocr')} disabled={busy}><span className="tool-card-icon mint"><ScanText size={23} /></span><ArrowUpRight className="tool-card-arrow" size={18} /><h3>Give scans a voice</h3><p>Recognize text locally.<br />Review and refine the result.</p><span className="tool-card-link">Recognize text <ArrowRight size={13} /></span></button>
          <button className="home-tool-card" onClick={() => onStartTool('fonts')} disabled={busy}><span className="tool-card-icon lavender"><Type size={23} /></span><ArrowUpRight className="tool-card-arrow" size={18} /><h3>Find the right face</h3><p>Inspect, upload, or recover<br />the fonts your PDF needs.</p><span className="tool-card-link">Font Studio <ArrowRight size={13} /></span></button>
          <button className="home-tool-card" onClick={() => onStartTool('replace')} disabled={busy}><span className="tool-card-icon butter"><Search size={23} /></span><ArrowUpRight className="tool-card-arrow" size={18} /><h3>Make one change, everywhere</h3><p>Find, preview, and replace<br />with a single undo step.</p><span className="tool-card-link">Find & replace <ArrowRight size={13} /></span></button>
        </div></section>

        <div className="home-reassurance"><span className="reassurance-icon"><ShieldCheck size={25} strokeWidth={1.5} /></span><div><strong>Your work stays in your hands.</strong><p>{IS_HOSTED ? 'Temporary server processing. Original files preserved. Open source, always.' : 'Local processing. Original files preserved. Open source, always.'}</p></div><a href="/api/license" target="_blank" rel="noreferrer">Built to be open <ArrowUpRight size={15} /></a></div>
        <footer className="home-footer"><span><img src="/brand/reage-mark.svg" alt="" /> A little more possibility.</span><div><a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a><a href="/api/brand-kit" download><ArrowDownToLine size={14} /> Brand assets</a><button onClick={onHelp}>Help & shortcuts</button><a href="/api/source" download><FileText size={14} /> Source</a></div></footer>
      </main>
    </div>
  </div>
}
