import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, LoaderCircle, Replace, X } from 'lucide-react'
import { api, messageOf } from '../api'
import { originalEdit } from '../useTextSession'
import type { PdfDocument, Snapshot, TextEdit } from '../types'
import PdfPreview from './PdfPreview'

interface Props {
  document: PdfDocument; snapshot: Snapshot; query: string; page: number; error: string
  onApply: (edits: TextEdit[]) => Promise<boolean>; onClose: () => void
}

export default function ReplaceDialog({ document, snapshot, query, page, error: outerError, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [find, setFind] = useState(query)
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [scope, setScope] = useState('all')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<Snapshot | null>(null)
  const [previewPage, setPreviewPage] = useState(page)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; dialog.current?.showModal(); return () => { alive.current = false } }, [])
  useEffect(() => { setPreview(null); setError(''); setExcluded(new Set()) }, [find, replacement, caseSensitive, wholeWord, scope])
  const matches = useMemo(() => {
    if (!find) return []
    const literal = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}\\p{M}_])${literal}(?![\\p{L}\\p{N}\\p{M}_])` : literal, caseSensitive ? 'gu' : 'giu')
    const existing = new Map(snapshot.edits.map(edit => [edit.span_id, edit]))
    return document.pages.flatMap(p => p.spans).filter(span => span.editable && (scope === 'all' || span.page === page)).flatMap(span => {
      const old = existing.get(span.id) ?? originalEdit(span)
      const text = old.text.replace(regex, () => replacement)
      return text === old.text ? [] : [{ span, old: old.text, edit: { ...old, text } }]
    })
  }, [document, snapshot, find, replacement, caseSensitive, wholeWord, scope, page])
  const included = matches.filter(match => !excluded.has(match.span.id))
  async function validate() {
    setBusy(true); setError('')
    try {
      const ids = new Set(included.map(match => match.span.id))
      const edits = [...snapshot.edits.filter(edit => !ids.has(edit.span_id)), ...included.map(match => match.edit)]
      const { changes } = await api.validate(document.id, edits)
      const pinned = edits.map(edit => {
        const change = changes.find(change => change.span_id === edit.span_id)
        return { ...edit, text: change?.text ?? edit.text, font: edit.font === 'auto' ? change?.font_id || 'original' : edit.font }
      })
      if (alive.current) { setPreview({ edits: pinned, changes }); setPreviewPage(included[0]?.span.page ?? page) }
    } catch (error) { if (alive.current) setError(messageOf(error)) }
    finally { if (alive.current) setBusy(false) }
  }
  async function apply() {
    if (!preview) return
    setBusy(true)
    try { if (await onApply(preview.edits)) onClose() }
    finally { if (alive.current) setBusy(false) }
  }
  return <dialog ref={dialog} className="recovery-dialog replace-dialog" aria-label="Find and replace" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="recovery-dialog-header"><div className="type-avatar"><Replace size={22} /></div><div><h2>Find. Review. Replace.</h2><p>A validated transaction with a single undo step.</p></div><button className="icon-button" disabled={busy} onClick={onClose} aria-label="Close find and replace"><X size={19} /></button></div>
    <div className="replace-layout"><div className="replace-controls">
      <label className="input-label">Find<input className="recovery-input" autoFocus aria-label="Text to find" value={find} maxLength={4000} disabled={busy} onChange={e => setFind(e.target.value)} /></label>
      <label className="input-label">Replace with<input className="recovery-input" aria-label="Replacement text" value={replacement} maxLength={4000} disabled={busy} onChange={e => setReplacement(e.target.value)} /></label>
      <div className="replace-options"><label><input type="checkbox" checked={caseSensitive} disabled={busy} onChange={e => setCaseSensitive(e.target.checked)} /> Match case</label><label><input type="checkbox" checked={wholeWord} disabled={busy} onChange={e => setWholeWord(e.target.checked)} /> Whole words</label></div>
      <label className="input-label">Scope<select className="recovery-input" aria-label="Replacement scope" value={scope} disabled={busy} onChange={e => setScope(e.target.value)}><option value="all">All pages</option><option value="page">Current page ({page + 1})</option></select></label>
      <p className="recovery-help">Matches within editable text runs, including recognized OCR. Each run keeps its own style. Cross-run phrases and hidden text are excluded.</p>
      <div className="replace-count" role="status">{included.length} of {matches.length} matching runs selected</div>
      <div className="replace-matches">{matches.slice(0, 1000).map(match => <label key={match.span.id}><input type="checkbox" checked={!excluded.has(match.span.id)} disabled={busy} onChange={() => { setExcluded(old => { const next = new Set(old); if (next.has(match.span.id)) next.delete(match.span.id); else next.add(match.span.id); return next }); setPreview(null) }} /><span><small>PAGE {match.span.page + 1} · {match.span.font}</small><del>{match.old}</del><strong>{match.edit.text || '(delete text)'}</strong></span></label>)}</div>
      {matches.length > 1000 && <p className="notice amber">Narrow the search to at most 1,000 runs.</p>}
    </div><div className="replace-preview">{preview ? <><label>Preview page <select aria-label="Replacement preview page" value={previewPage} onChange={e => setPreviewPage(Number(e.target.value))}>{[...new Set(included.map(match => match.span.page))].map(index => <option key={index} value={index}>{index + 1}</option>)}</select></label><PdfPreview documentId={document.id} page={document.pages[previewPage]} edits={preview.edits} changes={preview.changes} scale={Math.min(1, 380 / document.pages[previewPage].width)} /></> : <div className="panel-empty"><Replace size={29} /><strong>Review every replacement.</strong><p>Preview checks fonts and collisions, then renders the actual proposed PDF.</p></div>}</div></div>
    {(error || outerError) && <div className="notice error" role="alert"><AlertCircle size={16} /><span>{error || outerError}</span></div>}
    <div className="recovery-dialog-footer"><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !included.length || matches.length > 1000} onClick={() => void (preview ? apply() : validate())}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{busy ? 'Checking…' : preview ? `Apply ${included.length} replacements` : 'Preview replacements'}</button></div>
  </dialog>
}
