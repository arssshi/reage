import { useEffect, useRef } from 'react'
import { Fingerprint, X } from 'lucide-react'
import type { PdfDocument, Snapshot } from '../types'

export default function FidelityDialog({ document, snapshot, onClose }: { document: PdfDocument; snapshot: Snapshot; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const spans = new Map(document.pages.flatMap(page => page.spans).map(span => [span.id, span]))
  const reconstructed = snapshot.edits.filter(edit => spans.get(edit.span_id)?.source !== 'native').length
  const substitutes = snapshot.changes.filter(change => /substitute/i.test(change.font_resolution)).length
  return <dialog className="recovery-dialog fidelity-dialog" ref={dialog} aria-label="Edit fidelity report" onCancel={onClose}>
    <div className="recovery-dialog-header"><div className="type-avatar"><Fingerprint size={23} /></div><div><h2>Edit fidelity</h2><p>Applied changes in this copy.</p></div><button className="icon-button" aria-label="Close fidelity report" onClick={onClose}><X size={19} /></button></div>
    <div className="recovery-dialog-body"><div className="fidelity-totals"><div><strong>{snapshot.edits.length}</strong><span>Applied text edits</span></div><div><strong>{substitutes}</strong><span>Labeled substitutes</span></div><div><strong>{reconstructed}</strong><span>Reconstructed regions</span></div></div>
      <p className="recovery-help">Native text retains its baseline and uses the resolved font below. Family matches do not prove identical font versions. OCR and manual regions use estimated typography and a solid background. Unapplied drafts are excluded.</p>
      <div className="fidelity-list">{snapshot.changes.map(change => {
        const span = spans.get(change.span_id)!
        return <article key={change.span_id}><header><strong>Page {span.page + 1} · {span.source === 'native' ? 'Native text' : 'Reconstructed content'}</strong><span>{change.size.toFixed(2)} pt</span></header><p>{change.text || '(text removed)'}</p><dl><div><dt>Source face</dt><dd>{span.font}{span.subset ? ' · subset' : ''}</dd></div><div><dt>Output face</dt><dd>{change.font_name || 'None'}</dd></div><div><dt>Resolution</dt><dd>{change.font_resolution}</dd></div></dl></article>
      })}{!snapshot.edits.length && <p className="recovery-help">No applied text edits. An unchanged export retains the original PDF bytes.</p>}</div>
    </div><div className="recovery-dialog-footer"><span>Source structure and reading order are inferred.</span><button className="button secondary" onClick={onClose}>Back to editor</button></div>
  </dialog>
}
