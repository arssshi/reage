import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Copy, Download, FileText, GripVertical, LoaderCircle, Redo2, RotateCw, Trash2, Undo2, X } from 'lucide-react'
import type { ExportOptions, PdfDocument, Snapshot } from '../types'
import { IS_HOSTED } from '../config'
import PdfPreview from './PdfPreview'

interface PageEntry { id: number; page: number; rotation: number }
interface Props { document: PdfDocument; snapshot: Snapshot; currentPage: number; onDownload: (options: ExportOptions) => Promise<boolean>; onClose: () => void }

export default function ExportDialog({ document, snapshot, currentPage, onDownload, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const nextId = useRef(document.page_count)
  const [history, setHistory] = useState<PageEntry[][]>([document.pages.map(page => ({ id: page.index, page: page.index, rotation: 0 }))])
  const [cursor, setCursor] = useState(0)
  const [range, setRange] = useState('')
  const [filename, setFilename] = useState(`${document.name.replace(/\.pdf$/i, '')}-edited.pdf`)
  const [title, setTitle] = useState<string | undefined>()
  const [author, setAuthor] = useState<string | undefined>()
  const [optimize, setOptimize] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const drag = useRef<number | null>(null)
  const [dragTarget, setDragTarget] = useState<number | null>(null)
  const pages = history[cursor]
  const limit = IS_HOSTED ? 50 : 300
  useEffect(() => { dialog.current?.showModal() }, [])
  function update(next: PageEntry[]) {
    if (!next.length || next.length > limit) { setError(`Choose between 1 and ${limit} output pages.`); return }
    setHistory([...history.slice(0, cursor + 1), next].slice(-50)); setCursor(Math.min(cursor + 1, 49)); setError('')
  }
  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= pages.length) return
    const next = [...pages], [entry] = next.splice(from, 1)
    next.splice(to, 0, entry); update(next)
  }
  function applyRange() {
    try {
      const indexes: number[] = []
      if (!range.trim()) indexes.push(...document.pages.map(page => page.index))
      else for (const part of range.split(',')) {
        const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
        if (!match) throw new Error('Use page numbers and ranges, for example 1, 3-5 or 5-3.')
        const first = Number(match[1]), last = Number(match[2] ?? match[1])
        if (first < 1 || last < 1 || first > document.page_count || last > document.page_count) throw new Error(`Page numbers must be between 1 and ${document.page_count}.`)
        const step = first <= last ? 1 : -1
        for (let n = first; n !== last + step; n += step) {
          indexes.push(n - 1)
          if (indexes.length > limit) throw new Error(`Choose up to ${limit} output pages.`)
        }
      }
      update(indexes.map(page => ({ id: nextId.current++, page, rotation: 0 })))
    } catch (error) { setError(error instanceof Error ? error.message : 'Please check the page range.') }
  }
  async function download() {
    setBusy(true); setError('')
    try {
      const identity = pages.length === document.page_count && pages.every((entry, index) => entry.page === index && !entry.rotation)
      const success = await onDownload({ pages: identity ? undefined : pages.map(({ page, rotation }) => ({ page, rotation })), title, author, optimize, filename: filename.trim().replace(/\.pdf$/i, '') + '.pdf' })
      if (success) onClose()
      else setError('The PDF could not be exported. Check the current text edit and try again.')
    } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="recovery-dialog export-dialog" aria-label="Organize and export PDF" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="recovery-dialog-header"><div className="type-avatar"><FileText size={23} /></div><div><h2>Make the final copy yours.</h2><p>Arrange pages, choose a filename, and export your PDF.</p></div><button className="icon-button" aria-label="Close export options" disabled={busy} onClick={onClose}><X size={19} /></button></div>
    <div className="export-layout"><div className="export-settings">
      <label className="input-label" htmlFor="export-filename">File name</label><input id="export-filename" className="recovery-input" value={filename} maxLength={200} disabled={busy} onChange={event => setFilename(event.target.value)} />
      <div className="export-section"><h3>Choose your pages</h3><div className="export-presets"><button onClick={() => update(document.pages.map(page => ({ id: nextId.current++, page: page.index, rotation: 0 })))} disabled={busy}>All pages</button><button onClick={() => update([{ id: nextId.current++, page: currentPage, rotation: 0 }])} disabled={busy}>Current page</button></div><label className="input-label" htmlFor="export-range">Page numbers / ranges</label><div className="export-range"><input id="export-range" placeholder="e.g. 1, 3-5" value={range} disabled={busy} onChange={event => setRange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applyRange() }} /><button onClick={applyRange} disabled={busy}>Use range</button></div><p>Drag pages to reorder. Duplicate, rotate, or remove a page with its controls. Source page numbers stay visible.</p></div>
      <details className="export-advanced"><summary>Document details & optimization</summary><label className="input-label">Title<input className="recovery-input" aria-label="PDF title" value={title ?? ''} maxLength={250} placeholder="Keep existing title" disabled={busy} onChange={event => setTitle(event.target.value)} /></label><label className="input-label">Author<input className="recovery-input" aria-label="PDF author" value={author ?? ''} maxLength={250} placeholder="Keep existing author" disabled={busy} onChange={event => setAuthor(event.target.value)} /></label><label className="export-checkbox"><input type="checkbox" checked={optimize} disabled={busy} onChange={event => setOptimize(event.target.checked)} /><span>Subset fonts to reduce file size<small>Keeps used glyphs. A full font may be needed for future edits.</small></span></label></details>
      <div className="export-summary"><strong>{pages.length} {pages.length === 1 ? 'page' : 'pages'} · {snapshot.edits.length} text edits</strong><p>Native text stays searchable. Your preview and exported text use the same PDF engine.</p></div>
    </div><div className="export-pages"><div className="export-pages-heading"><strong>Output order <span>{pages.length}</span></strong><div><button className="icon-button tiny" aria-label="Undo page arrangement" disabled={!cursor || busy} onClick={() => { setCursor(cursor - 1); setError('') }}><Undo2 size={15} /></button><button className="icon-button tiny" aria-label="Redo page arrangement" disabled={cursor === history.length - 1 || busy} onClick={() => { setCursor(cursor + 1); setError('') }}><Redo2 size={15} /></button></div></div><div className="export-page-grid">{pages.map((entry, index) => <article className={`export-page ${dragTarget === index ? 'drop-target' : ''}`} key={entry.id} draggable={!busy} aria-label={`Output page ${index + 1}, source page ${entry.page + 1}`} onDragStart={event => { drag.current = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/reage-page', String(entry.id)) }} onDragOver={event => { if (drag.current !== null) { event.preventDefault(); setDragTarget(index) } }} onDrop={event => { if (drag.current !== null) { event.preventDefault(); event.stopPropagation(); move(drag.current, index); drag.current = null; setDragTarget(null) } }} onDragEnd={() => { drag.current = null; setDragTarget(null) }}>
      <header><GripVertical size={14} /><strong>{index + 1}</strong><span>Source {entry.page + 1}</span></header><div className="export-page-preview"><div style={{ transform: `rotate(${entry.rotation}deg)` }}><PdfPreview documentId={document.id} page={document.pages[entry.page]} edits={snapshot.edits} scale={105 / Math.max(document.pages[entry.page].width, document.pages[entry.page].height)} thumbnail /></div>{entry.rotation > 0 && <span className="export-rotation">+{entry.rotation}°</span>}</div>
      <div className="export-page-actions"><button className="icon-button tiny" aria-label={`Move output page ${index + 1} earlier`} disabled={busy || !index} onClick={() => move(index, index - 1)}><ArrowUp size={14} /></button><button className="icon-button tiny" aria-label={`Move output page ${index + 1} later`} disabled={busy || index === pages.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={14} /></button><button className="icon-button tiny" aria-label={`Rotate output page ${index + 1}`} disabled={busy} onClick={() => update(pages.map((page, i) => i === index ? { ...page, rotation: (page.rotation + 90) % 360 } : page))}><RotateCw size={14} /></button><button className="icon-button tiny" aria-label={`Duplicate output page ${index + 1}`} disabled={busy || pages.length >= limit} onClick={() => { const next = [...pages]; next.splice(index + 1, 0, { ...entry, id: nextId.current++ }); update(next) }}><Copy size={14} /></button><button className="icon-button tiny danger" aria-label={`Remove output page ${index + 1}`} disabled={busy || pages.length === 1} onClick={() => update(pages.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>
    </article>)}</div></div></div>
    {error && <div className="notice error export-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
    <div className="recovery-dialog-footer"><span>Page arrangements affect this exported copy.</span><button className="button primary" disabled={busy || !filename.trim()} onClick={() => void download()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{busy ? 'Exporting…' : 'Download PDF'}</button></div>
  </dialog>
}
