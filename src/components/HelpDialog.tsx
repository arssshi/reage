import { useEffect, useRef } from 'react'
import { Download, Github, Heart, Keyboard, X } from 'lucide-react'
import { GITHUB_URL, PRIVACY_COPY } from '../config'

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog className="help-dialog" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose() }}>
    <div className="dialog-heading"><div className="type-avatar"><Keyboard size={24} /></div><button className="icon-button" onClick={onClose} aria-label="Close help"><X size={19} /></button></div>
    <p className="eyebrow">THE DOCUMENT STUDIO</p><h2>A precise place<br />to make a change.</h2><p className="dialog-description">Click existing text and type directly on the page. Your input is checked automatically after a pause; press Enter to finish. Use the properties panel for explicit font, size, color and fit changes, then choose Apply changes.</p>
    <div className="shortcuts">{[['Open a PDF', '⌘ / Ctrl O'], ['Export your PDF', '⌘ / Ctrl S'], ['Find text', '⌘ / Ctrl F'], ['Command palette', '⌘ / Ctrl K'], ['Undo / redo', '⌘ / Ctrl Z / ⇧ Z'], ['Finish on-page typing', 'Enter'], ['Apply properties', '⌘ / Ctrl Enter'], ['Finish / deselect', 'Esc']].map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
    <div className="dialog-note"><strong>Understand the preview</strong><p>On-page typing uses a browser draft. Reusable web fonts are loaded into the browser; otherwise the live draft uses a labeled approximation. Finish typing to see the authoritative PDF render. Edits remain single text runs; Enter finishes an edit rather than inserting a paragraph.</p><p>Auto tries the original font, an available matching full font, then a labeled substitute. Font Studio can inspect PDF fonts, upload a TTF/OTF, or download an open family.</p><p>For images and outlines, use Scan text (OCR) or Replace region. Review estimated fonts, recognition, and the solid background color. Use Zoom to selection for tiny text. Export before closing; sessions are temporary.</p></div>
    <p className="recovery-help">{PRIVACY_COPY}</p>
    <div className="dialog-footer"><span><Heart size={14} /><a href="/api/license" target="_blank" rel="noreferrer">AGPL-3.0-or-later ↗</a></span><a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a><a href="/api/source" download><Download size={14} /> Download source</a></div>
    <p className="legal-note">© 2026 Reage contributors. Free to use, modify, and share under the AGPL. Provided without warranty. Powered by PyMuPDF.</p>
  </dialog>
}
