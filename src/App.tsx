import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, Upload, X } from 'lucide-react'
import { api, messageOf } from './api'
import type { PdfDocument, WorkspaceTool } from './types'
import Editor from './Editor'
import HelpDialog from './components/HelpDialog'
import Welcome from './components/Welcome'
import ServiceStatus from './components/ServiceStatus'
import { MAX_UPLOAD_MB } from './config'

export default function App() {
  const [document, setDocument] = useState<PdfDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [help, setHelp] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const unsaved = useRef(false)
  const dragCount = useRef(0)
  const busyRef = useRef(false)
  const pendingTool = useRef<WorkspaceTool>('edit')
  const [initialTool, setInitialTool] = useState<WorkspaceTool>('edit')
  const onUnsaved = useCallback((value: boolean) => { unsaved.current = value }, [])

  useEffect(() => {
    window.document.documentElement.dataset.theme = 'light'
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  async function open(file?: File, scanned = false) {
    if (busyRef.current) return
    if (file && file.size > MAX_UPLOAD_MB * 1024 * 1024) { setError(`Please choose a PDF smaller than ${MAX_UPLOAD_MB} MB.${MAX_UPLOAD_MB < 30 ? ' Run Reage locally for larger files.' : ''}`); return }
    if (file && !file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') { setError('Reage opens PDF files. Please choose a .pdf document.'); return }
    if (unsaved.current && !window.confirm('Open another PDF? Export your current work first if you want to keep it.')) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = file ? await api.upload(file) : await api.demo(scanned)
      const previous = document
      unsaved.current = false
      setInitialTool(pendingTool.current)
      pendingTool.current = 'edit'
      setDocument(result)
      if (previous) void api.close(previous.id).catch(() => {})
    } catch (error) { setError(messageOf(error)) }
    finally { setBusy(false); busyRef.current = false }
  }

  function home() {
    if (busy || (unsaved.current && !window.confirm('Close this document? Export your changes first to keep an edited copy.'))) return
    if (document) void api.close(document.id).catch(() => {})
    setDocument(null)
    unsaved.current = false
    setError('')
  }

  return <div className="app" onDragEnter={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) { dragCount.current += 1; setDragging(true) } }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); dragCount.current -= 1; if (dragCount.current <= 0) { dragCount.current = 0; setDragging(false) } }} onDrop={event => { event.preventDefault(); dragCount.current = 0; setDragging(false); const file = event.dataTransfer.files[0]; if (file) void open(file) }}>
    <input className="visually-hidden" ref={input} type="file" accept="application/pdf,.pdf" aria-label="Choose PDF file" onChange={event => { const file = event.target.files?.[0]; if (file) void open(file); event.target.value = '' }} />
    {document ? <Editor key={document.id} document={document} initialTool={initialTool} onOpen={() => { pendingTool.current = 'edit'; input.current?.click() }} onHome={home} onUnsaved={onUnsaved} /> : <Welcome busy={busy} onOpen={() => { pendingTool.current = 'edit'; input.current?.click() }} onStartTool={tool => { pendingTool.current = tool; input.current?.click() }} onDemo={scanned => { pendingTool.current = 'edit'; void open(undefined, scanned) }} onHelp={() => setHelp(true)} />}
    {error && <div className="app-error" role="alert"><AlertCircle size={18} /><span>{error}</span><button className="icon-button tiny" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
    {busy && <div className="busy-overlay" role="status"><div><div className="loading-logo"><img src="/favicon.svg" alt="" /><LoaderCircle size={62} className="spin" /></div><h2>Making room for your document.</h2><p>Reading pages, text, and original fonts…</p></div></div>}
    {dragging && <div className="drop-overlay"><Upload size={46} /><h2>A fresh page starts here.</h2><p>Drop your PDF to open it in Reage.</p></div>}
    {help && <HelpDialog onClose={() => setHelp(false)} />}
    <ServiceStatus />
  </div>
}
