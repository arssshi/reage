import { useEffect, useRef } from 'react'
import { Download, Github, Heart, Keyboard, X } from 'lucide-react'
import { GITHUB_URL, PRIVACY_COPY } from '../config'

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog className="help-dialog" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose() }}>
    <div className="dialog-heading"><div className="type-avatar"><Keyboard size={24} /></div><button className="icon-button" onClick={onClose} aria-label="Close help"><X size={19} /></button></div>
    <p className="eyebrow">THE DOCUMENT STUDIO</p><h2>A precise place<br />to make a change.</h2><p className="dialog-description">Click text and type directly on the page. Use the formatting bar to change its style instantly. Press Enter to finish typing and reveal move and resize handles. Advanced properties use Apply changes.</p>
    <div className="shortcuts">{[['Open a PDF', '⌘ / Ctrl O'], ['Export your PDF', '⌘ / Ctrl S'], ['Find text', '⌘ / Ctrl F'], ['Command palette', '⌘ / Ctrl K'], ['Undo / redo', '⌘ / Ctrl Z / ⇧ Z'], ['Bold / italic / underline', '⌘ / Ctrl B / I / U'], ['Duplicate selected text', '⌘ / Ctrl D'], ['Edit / move / add text', 'E / V / T'], ['Nudge / larger nudge', 'Arrows / ⇧ Arrows'], ['Delete selected text', 'Delete'], ['Finish on-page typing', 'Enter'], ['Apply properties', '⌘ / Ctrl Enter'], ['Finish / deselect', 'Esc']].map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
    <div className="dialog-note"><strong>Make the most of your workspace</strong><p>Move with the handle above selected text; resize from its lower-right corner. Alignment guides snap to nearby text and page edges. Hold Shift to lock movement to one direction, or Alt to ignore snapping. Text alignment stays within its original width.</p><p>Bold and italic use real font faces. Font Studio checks embedded companions and full local fonts, then offers complete open faces to download. Auto identifies substitutes clearly. Missing subset outlines and original fonts in scanned images cannot be recovered exactly.</p><p>On-page typing is a browser draft; finishing displays the authoritative PDF render. Editing is per text run, including added text. Enter finishes rather than inserting a paragraph. Compare with Original above the canvas.</p><p>For images and outlines, use Scan text (OCR) or Replace region. Review recognition, estimated typography, and background. The arrow beside Export PDF opens page arrangement, extraction, metadata, and font optimization. Export before closing; sessions are temporary.</p></div>
    <p className="recovery-help">{PRIVACY_COPY}</p>
    <div className="dialog-footer"><span><Heart size={14} /><a href="/api/license" target="_blank" rel="noreferrer">AGPL-3.0-or-later ↗</a></span><a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a><a href="/api/source" download><Download size={14} /> Download source</a></div>
    <p className="legal-note">© 2026 Reage contributors. Free to use, modify, and share under the AGPL. Provided without warranty. Powered by PyMuPDF.</p>
  </dialog>
}
