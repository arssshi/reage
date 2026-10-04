import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Crop, Download, FilePlus2, FileText, Fingerprint, Focus, History, LoaderCircle, LockKeyhole, Maximize, Minimize2, Minus, MousePointer2, PanelLeftClose, PanelLeftOpen, Plus, Redo2, ScanText, Search, TextCursorInput, Type, Undo2, X } from 'lucide-react'
import { api, APP_VERSION, messageOf } from './api'
import { GITHUB_URL, IS_HOSTED } from './config'
import type { Box, FontEntry, PdfDocument, TextSpan, WorkspaceTool } from './types'
import { originalEdit, useTextSession } from './useTextSession'
import PdfPreview from './components/PdfPreview'
import Inspector from './components/Inspector'
import HelpDialog from './components/HelpDialog'
import FontStudio from './components/FontStudio'
import OcrDialog from './components/OcrDialog'
import BrandLogo from './components/BrandLogo'
import CommandPalette, { type EditorCommand } from './components/CommandPalette'
import ReplaceDialog from './components/ReplaceDialog'
import FidelityDialog from './components/FidelityDialog'

interface Props {
  document: PdfDocument
  onOpen: () => void
  onHome: () => void
  onUnsaved: (unsaved: boolean) => void
  initialTool?: WorkspaceTool
}

export default function Editor({ document: initialPdf, initialTool = 'edit', onOpen, onHome, onUnsaved }: Props) {
  const [pdf, setPdf] = useState(initialPdf)
  const [fontStudio, setFontStudio] = useState(initialTool === 'fonts')
  const [ocr, setOCR] = useState(initialTool === 'ocr')
  const [libraryFonts, setLibraryFonts] = useState<FontEntry[]>([])
  const [notice, setNotice] = useState('')
  const session = useTextSession(pdf.id, setNotice)
  const { history, cursor, snapshot, selected, draft, dirty, error, setDraft, setError, applyDraft, restore } = session
  const [exported, setExported] = useState('[]')
  const [pageNumber, setPageNumber] = useState(0)
  const [operationBusy, setOperationBusy] = useState(false)
  const applying = session.applying || operationBusy
  const [inlineActive, setInlineActive] = useState(false)
  const [inlineCaret, setInlineCaret] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [help, setHelp] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(initialTool === 'replace')
  const [fidelityOpen, setFidelityOpen] = useState(false)
  const [sidePanel, setSidePanel] = useState<'pages' | 'search' | 'history'>('pages')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1050)
  const [inspectorExpanded, setInspectorExpanded] = useState(() => window.innerWidth > 720)
  const [focusMode, setFocusMode] = useState(false)
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState<'edit' | 'view' | 'region'>('edit')
  const [showBounds, setShowBounds] = useState(false)
  const [zoom, setZoom] = useState<number | 'fit' | 'page'>('fit')
  const [canvasWidth, setCanvasWidth] = useState(850)
  const [canvasHeight, setCanvasHeight] = useState(700)
  const [focusRequest, setFocusRequest] = useState(0)
  const canvas = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const unsaved = JSON.stringify(snapshot.edits) !== exported || dirty
  const page = pdf.pages[pageNumber]
  const fitWidth = (canvasWidth - (canvasWidth < 500 ? 36 : 88)) / page.width
  const scale = zoom === 'fit' ? Math.max(0.2, Math.min(1.5, fitWidth)) : zoom === 'page' ? Math.max(0.2, Math.min(fitWidth, (canvasHeight - 120) / page.height)) : zoom / 100
  const editMap = useMemo(() => new Map(snapshot.edits.map(edit => [edit.span_id, edit])), [snapshot])
  const allSpans = useMemo(() => pdf.pages.flatMap(page => page.spans), [pdf])
  const results = useMemo(() => query.trim() ? allSpans.filter(span => (editMap.get(span.id)?.text ?? span.text).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 100) : [], [allSpans, editMap, query])

  useEffect(() => { onUnsaved(unsaved) }, [unsaved, onUnsaved])
  useEffect(() => {
    if (!canvas.current) return
    const observer = new ResizeObserver(entries => { setCanvasWidth(entries[0].contentRect.width); setCanvasHeight(entries[0].contentRect.height) })
    observer.observe(canvas.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { canvas.current?.scrollTo({ top: 0, left: 0 }) }, [pageNumber])
  useEffect(() => {
    if (!focusRequest) return
    const frame = requestAnimationFrame(() => {
      const element = canvas.current?.querySelector('.text-region.selected')
      element?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      if (element && canvas.current && window.matchMedia('(max-width: 720px)').matches) {
        const sheet = window.document.querySelector('.inspector.has-selection')?.getBoundingClientRect()
        const area = canvas.current.getBoundingClientRect()
        const box = element.getBoundingClientRect()
        if (sheet && sheet.height > 0) canvas.current.scrollTop += box.top + box.height / 2 - (area.top + sheet.top) / 2
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest, scale, pageNumber, inspectorExpanded])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => { if (sidePanel === 'search' && sidebarOpen) searchInput.current?.focus() }, [sidePanel, sidebarOpen])
  useEffect(() => {
    if (error && window.innerWidth <= 720) { setInspectorExpanded(true); setFocusRequest(value => value + 1) }
  }, [error])
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1050px)')
    const phone = window.matchMedia('(max-width: 720px)')
    const closeNavigation = () => { if (compact.matches) setSidebarOpen(false) }
    const adaptProperties = () => { setInspectorExpanded(!phone.matches); setFocusRequest(value => value + 1) }
    compact.addEventListener('change', closeNavigation)
    phone.addEventListener('change', adaptProperties)
    return () => { compact.removeEventListener('change', closeNavigation); phone.removeEventListener('change', adaptProperties) }
  }, [])

  async function chooseSpan(span: TextSpan | null, caret?: number) {
    if (operationBusy || !await session.select(span)) return
    setInlineActive(!!span?.editable && caret !== undefined)
    setInlineCaret(caret ?? null)
    if (span) {
      setPageNumber(span.page); setTool('edit')
      if (window.innerWidth <= 1050) setSidebarOpen(false)
      if (window.innerWidth <= 720) { setInspectorExpanded(caret === undefined); setFocusRequest(value => value + 1) }
    }
  }

  async function navigate(index: number) {
    if (index < 0 || index >= pdf.page_count || index === pageNumber || operationBusy || !await session.select(null)) return
    setPageNumber(index)
    setInlineActive(false)
    if (window.innerWidth <= 1050) setSidebarOpen(false)
  }

  function focusSelection() {
    if (!selected) return
    setZoom(Math.min(300, Math.max(100, Math.ceil(Math.max(scale, 18 / selected.size) * 4) * 25)))
    setFocusRequest(value => value + 1)
  }

  async function moveHistory(next: number) {
    await session.moveHistory(next - cursor)
    setInlineActive(false)
  }

  async function openOCR() {
    if (operationBusy || !await session.select(null)) return
    setInlineActive(false); setOCR(true)
  }

  async function startRegion() {
    if (operationBusy || !await session.select(null)) return
    setInlineActive(false)
    setTool(tool === 'region' ? 'edit' : 'region')
  }

  async function createRegion(box: Box) {
    if (applying) return
    setOperationBusy(true)
    try {
      const result = await api.addRegion(pdf.id, pageNumber, box)
      setPdf(result.document)
      const span = result.document.pages[pageNumber].spans.find(span => span.id === result.span_id)!
      await session.select(span)
      setDraft({ ...originalEdit(span), background: span.background })
      setInspectorExpanded(true)
      setTool('edit')
    } catch (error) { setNotice(`Region: ${messageOf(error)}`) }
    finally { setOperationBusy(false) }
  }

  function chooseLibraryFont(font: FontEntry) {
    setLibraryFonts(fonts => [font, ...fonts.filter(entry => entry.id !== font.id)])
    if (draft) { setDraft({ ...draft, font: font.id }); setError('') }
    setFontStudio(false)
  }

  async function finishInline() {
    const before = session.latest()
    if (before.automatic && !await session.flush()) return
    if (session.latest().draft?.span_id === before.draft?.span_id) setInlineActive(false)
  }

  async function openReplace() {
    if (!await session.select(null)) return
    setInlineActive(false); setReplaceOpen(true)
  }

  async function switchMode(next: 'edit' | 'view') {
    if (!await session.select(null)) return
    setInlineActive(false); setTool(next)
  }

  async function toggleProperties() {
    await finishInline()
    setInspectorExpanded(value => !value)
    setFocusRequest(value => value + 1)
  }

  async function download() {
    if (exporting || operationBusy) return
    setExporting(true)
    try {
      await session.wait()
      if (session.latest().automatic && !await session.flush()) return
      const latest = session.latest()
      if (latest.dirty) { setError('Apply or restore your current text changes before exporting.'); return }
      const blob = await api.export(pdf.id, latest.snapshot.edits)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = `${pdf.name.replace(/\.pdf$/i, '')}-edited.pdf`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setExported(JSON.stringify(latest.snapshot.edits))
      setNotice('Your edited PDF has been downloaded.')
    } catch (error) { setNotice(`Export failed: ${messageOf(error)}`) }
    finally { setExporting(false) }
  }

  function dismissWorkspaceLayer() {
    if (focusMode) setFocusMode(false)
    else if (sidebarOpen && window.innerWidth <= 1050) setSidebarOpen(false)
    else void chooseSpan(null)
  }
  const handlers = useRef({ download, moveHistory, dismissWorkspaceLayer, onOpen, cursor })
  handlers.current = { download, moveHistory, dismissWorkspaceLayer, onOpen, cursor }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (modifier && key === 'k') { event.preventDefault(); setCommandsOpen(value => !value); return }
      if (modifier && key === 's') { event.preventDefault(); void handlers.current.download() }
      if (modifier && key === 'o') { event.preventDefault(); handlers.current.onOpen() }
      if (modifier && key === 'f') { event.preventDefault(); setSidebarOpen(true); setSidePanel('search'); searchInput.current?.focus() }
      const inInput = (event.target as HTMLElement).matches('input, textarea, select, [contenteditable="true"]')
      if (modifier && !inInput && key === 'z') { event.preventDefault(); handlers.current.moveHistory(handlers.current.cursor + (event.shiftKey ? 1 : -1)) }
      if (modifier && !inInput && key === 'y') { event.preventDefault(); handlers.current.moveHistory(handlers.current.cursor + 1) }
      if (event.key === 'Escape' && !window.document.querySelector('dialog[open]')) handlers.current.dismissWorkspaceLayer()
      if (event.key === '?' && !inInput) setHelp(true)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  const openPanel = useCallback((panel: typeof sidePanel) => { setSidePanel(panel); setSidebarOpen(true); setFocusMode(false) }, [])
  const commands: EditorCommand[] = [
    { name: 'Open PDF', group: 'Document', shortcut: '⌘ / Ctrl O', run: onOpen },
    { name: 'Export PDF', group: 'Document', shortcut: '⌘ / Ctrl S', run: () => void download(), disabled: exporting },
    { name: 'Find text', group: 'Navigate', shortcut: '⌘ / Ctrl F', run: () => openPanel('search') },
    { name: 'Find and replace', group: 'Edit', run: () => void openReplace() },
    { name: 'Show pages', group: 'Navigate', run: () => openPanel('pages') },
    { name: 'Edit history', group: 'Document', run: () => openPanel('history') },
    { name: 'Review edit fidelity', group: 'Document', run: () => setFidelityOpen(true) },
    { name: 'Undo', group: 'Edit', shortcut: '⌘ / Ctrl Z', run: () => void moveHistory(cursor - 1), disabled: !cursor && !dirty },
    { name: 'Redo', group: 'Edit', run: () => void moveHistory(cursor + 1), disabled: cursor === history.length - 1 },
    { name: 'Font Studio', group: 'Typography', run: () => setFontStudio(true) },
    { name: 'Scan text (OCR)', group: 'Recover', run: () => void openOCR() },
    { name: 'Replace region', group: 'Recover', run: () => void startRegion() },
    { name: 'Zoom to selection', group: 'View', run: focusSelection, disabled: !selected },
    { name: 'Fit width', group: 'View', run: () => setZoom('fit') },
    { name: 'Fit page', group: 'View', run: () => setZoom('page') },
    { name: focusMode ? 'Exit focus mode' : 'Focus mode', group: 'View', run: () => setFocusMode(value => !value) },
    { name: showBounds ? 'Hide text boundaries' : 'Show text boundaries', group: 'View', run: () => setShowBounds(value => !value) },
    { name: 'Help & keyboard shortcuts', group: 'Help', shortcut: '?', run: () => setHelp(true) },
  ]

  return <div className={`editor-shell ${focusMode ? 'is-focus-mode' : ''} ${inspectorExpanded ? 'properties-expanded' : ''}`}>
    <header className="app-header">
      <button className="brand" onClick={onHome} aria-label="Reage home"><BrandLogo /></button>
      <span className="header-divider" /><button className="workspace-back" onClick={onHome}>Workspace</button><ChevronRight className="breadcrumb-chevron" size={14} />
      <div className="file-heading"><div className="file-title"><span title={pdf.name}>{pdf.name}</span><span className="pdf-badge">PDF</span></div><span className="session-status"><span className={`status-dot ${unsaved ? 'pending' : ''}`} />{applying ? 'Validating your edit…' : dirty ? 'Draft changes' : snapshot.edits.length ? unsaved ? `${snapshot.edits.length} ${snapshot.edits.length === 1 ? 'edit' : 'edits'} · ready to export` : 'Edited copy exported' : 'Original safely preserved'}</span></div>
      <div className="header-actions"><button className="command-trigger" onClick={() => setCommandsOpen(true)} aria-label="Open command palette" title="Commands (Ctrl / ⌘ K)"><Search size={17} /><span>Quick actions</span><kbd>⌘ K</kbd></button><button className="icon-button open-button" onClick={onOpen} aria-label="Open PDF" title="Open another PDF"><FilePlus2 size={19} /></button><button className="button primary" onClick={() => void download()} disabled={exporting || operationBusy}>{exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}<span>{exporting ? 'Exporting…' : 'Export PDF'}</span></button></div>
    </header>

    <div className="editor-toolbar">
      <div className="toolbar-group toolbar-history"><button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>{sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</button><span className="toolbar-divider" /><button className="icon-button" onClick={() => moveHistory(cursor - 1)} disabled={cursor === 0 || applying} title="Undo (Ctrl / ⌘ Z)" aria-label="Undo"><Undo2 size={18} /></button><button className="icon-button" onClick={() => moveHistory(cursor + 1)} disabled={cursor === history.length - 1 || applying} title="Redo (Ctrl / ⌘ Shift Z)" aria-label="Redo"><Redo2 size={18} /></button></div>
      <div className="workspace-tools recovery-toolbar" role="toolbar" aria-label="PDF editing tools"><button className={`workspace-tool ${tool === 'edit' ? 'active' : ''}`} onClick={() => void switchMode('edit')} aria-pressed={tool === 'edit'}><TextCursorInput size={18} /><span>Edit text</span></button><button className={`workspace-tool view-tool ${tool === 'view' ? 'active' : ''}`} onClick={() => void switchMode('view')} title="View without text selection" aria-label="View mode" aria-pressed={tool === 'view'}><MousePointer2 size={18} /><span>View</span></button><span className="toolbar-divider" /><button className="workspace-tool" onClick={() => setFontStudio(true)} disabled={applying}><Type size={18} /><span>Font Studio</span></button><button className="workspace-tool" onClick={openOCR} disabled={applying} aria-label="Scan text (OCR)"><ScanText size={18} /><span>Scan text</span><small>OCR</small></button><button className={`workspace-tool ${tool === 'region' ? 'active' : ''}`} onClick={startRegion} disabled={applying} aria-pressed={tool === 'region'}><Crop size={18} /><span>Replace region</span></button></div>
      <button className="fidelity-trigger" onClick={() => setFidelityOpen(true)} title="Review applied edit fidelity"><Fingerprint size={17} /><span>Fidelity report</span></button>
    </div>

    <div className="editor-body">
      <nav className="activity-rail" aria-label="Workspace panels"><div><button className={`rail-button ${sidebarOpen && sidePanel === 'pages' ? 'active' : ''}`} onClick={() => openPanel('pages')} title="Pages" aria-label="Pages panel"><FileText size={20} /><span>Pages</span></button><button className={`rail-button ${sidebarOpen && sidePanel === 'search' ? 'active' : ''}`} onClick={() => openPanel('search')} title="Find text" aria-label="Find text"><Search size={20} /><span>Find</span></button><button className={`rail-button ${sidebarOpen && sidePanel === 'history' ? 'active' : ''}`} onClick={() => openPanel('history')} title="Edit history" aria-label="Edit history"><History size={20} /><span>History</span></button></div><button className="rail-button" onClick={() => setHelp(true)} title="Help & keyboard shortcuts" aria-label="Help & keyboard shortcuts"><CircleHelp size={20} /><span>Help</span></button></nav>
      {sidebarOpen && <button className="panel-scrim" aria-label="Close navigation panel" onClick={() => setSidebarOpen(false)} />}
      {sidebarOpen && <aside className="left-panel" aria-label={sidePanel}>
        <div className="panel-heading"><span>{sidePanel === 'pages' ? 'Pages' : sidePanel === 'search' ? 'Find in document' : 'Edit history'}</span><span className="count-badge">{sidePanel === 'pages' ? pdf.page_count : sidePanel === 'search' ? results.length : snapshot.edits.length}</span><button className="icon-button tiny panel-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><X size={16} /></button></div>
        {sidePanel === 'search' && <button className="replace-launch" onClick={() => void openReplace()}>Find and replace <ArrowRight size={13} /></button>}
        {sidePanel === 'pages' && <><div className="thumbnails">{pdf.pages.map(thumbnail => <button key={thumbnail.index} className={`thumbnail-button ${thumbnail.index === pageNumber ? 'active' : ''}`} onClick={() => navigate(thumbnail.index)} aria-label={`Go to page ${thumbnail.index + 1}`} aria-current={thumbnail.index === pageNumber ? 'page' : undefined}><div className="thumbnail-frame"><PdfPreview documentId={pdf.id} page={thumbnail} edits={snapshot.edits} scale={132 / thumbnail.width} thumbnail />{thumbnail.spans.some(span => editMap.has(span.id)) && <span className="edited-indicator" title="Contains edits" />}</div><span className="thumbnail-label">{thumbnail.index + 1}{thumbnail.index === pageNumber && <span>Current page</span>}</span></button>)}</div><div className="sidebar-bottom"><LockKeyhole size={13} /> A private little workspace.</div></>}
        {sidePanel === 'search' && <><div className="search-field"><Search size={15} /><input ref={searchInput} placeholder="Search document…" aria-label="Search document" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-button tiny" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</div><div className="search-results">{results.map(span => <button key={span.id} className={`search-result ${selected?.id === span.id ? 'active' : ''}`} onClick={() => chooseSpan(span)}><span>PAGE {span.page + 1}</span><p>{editMap.get(span.id)?.text ?? span.text}</p><ArrowRight size={13} /></button>)}{!results.length && <div className="panel-empty"><Search size={25} /><strong>{query ? 'No matches found' : 'Find the right words.'}</strong><p>{query ? 'Try a different word or phrase.' : 'Search text across every page in your PDF.'}</p></div>}{results.length === 100 && <p className="search-limit">Showing the first 100 matches.</p>}</div></>}
        {sidePanel === 'history' && <div className="history-panel"><div className="history-header"><div><span className="status-dot" /><strong>{cursor} applied {cursor === 1 ? 'step' : 'steps'}</strong></div><p>Undo and redo any applied edit during this session.</p></div><div className="history-controls"><button className="button secondary small" disabled={!cursor || applying} onClick={() => moveHistory(cursor - 1)}><Undo2 size={14} /> Undo</button><button className="button secondary small" disabled={cursor === history.length - 1 || applying} onClick={() => moveHistory(cursor + 1)}><Redo2 size={14} /> Redo</button></div>{snapshot.edits.map(edit => { const span = allSpans.find(span => span.id === edit.span_id)!; return <button className="history-item" key={edit.span_id} onClick={() => chooseSpan(span)}><div><TypeIcon /><span>Page {span.page + 1}</span><Check size={13} /></div><del>{span.text}</del><p>{edit.text || 'Text deleted'}</p></button> })}{!snapshot.edits.length && <div className="panel-empty"><History size={27} /><strong>A fresh start.</strong><p>Your applied text edits will appear here.</p></div>}</div>}
      </aside>}

      <div className="canvas-area"><main ref={canvas} className={`document-canvas ${tool === 'view' ? 'view-mode' : ''}`} aria-label="PDF canvas" onClick={() => chooseSpan(null)}>
        {page.needs_ocr && <div className="ocr-page-banner" onClick={event => event.stopPropagation()}><ScanText size={21} /><div><strong>{page.text_kind === 'image' ? 'This page is an image, not a text layer.' : 'This page needs text recovery.'}</strong><p>Recognize the words with local OCR, or draw a region to replace visible text.</p></div><button className="button primary small" onClick={openOCR}>Recognize text</button></div>}
        <div className="canvas-topline"><span>{tool === 'region' ? <Crop size={14} /> : tool === 'edit' ? <TextCursorInput size={14} /> : <MousePointer2 size={14} />}{tool === 'region' ? 'Draw around the text you want to replace' : tool === 'edit' ? inlineActive ? 'Type naturally. Press Enter to finish.' : 'Click any text to make a change' : 'A clear view of your document'}</span><button className={`canvas-boundaries ${showBounds ? 'active' : ''}`} onClick={event => { event.stopPropagation(); setShowBounds(value => !value) }} title="Show all text boundaries" aria-label="Show text boundaries" aria-pressed={showBounds}><Focus size={16} /><span>Text boundaries</span></button></div>
        <div className="page-stage"><PdfPreview key={pageNumber} documentId={pdf.id} page={page} edits={snapshot.edits} changes={snapshot.changes} scale={scale} selected={selected?.id} showBounds={showBounds} interactive={tool === 'edit'} onSelect={chooseSpan} regionMode={tool === 'region'} onRegion={box => void createRegion(box)} inlineDraft={inlineActive ? draft : null} inlineCaret={inlineCaret} inlineError={error} onInlineChange={text => { const latest = session.latest().draft; if (latest) setDraft({ ...latest, text }, true) }} onInlineCommit={() => void finishInline()} onComposition={session.composition} onInlineClose={() => void finishInline()} /></div>
        <div className="canvas-bottom"><span>{page.width.toFixed(0)} × {page.height.toFixed(0)} pt</span><span>Page {pageNumber + 1} of {pdf.page_count}</span></div>
      </main>
      <div className="canvas-dock" aria-label="Page and zoom controls"><div className="page-controls"><button className="icon-button" onClick={() => navigate(pageNumber - 1)} disabled={pageNumber === 0} aria-label="Previous page"><ChevronLeft size={17} /></button><select aria-label="Current page" value={pageNumber} onChange={e => navigate(Number(e.target.value))}>{pdf.pages.map(page => <option key={page.index} value={page.index}>{page.index + 1}</option>)}</select><span className="subtle">/ {pdf.page_count}</span><button className="icon-button" onClick={() => navigate(pageNumber + 1)} disabled={pageNumber === pdf.page_count - 1} aria-label="Next page"><ChevronRight size={17} /></button></div><span className="toolbar-divider" /><div className="zoom-controls"><button className="icon-button" onClick={() => setZoom(Math.max(25, Math.round(scale * 100 / 25) * 25 - 25))} disabled={scale <= .25} aria-label="Zoom out"><Minus size={16} /></button><div className="zoom-select"><select aria-label="Zoom" value={zoom} onChange={e => setZoom(['fit', 'page'].includes(e.target.value) ? e.target.value as 'fit' | 'page' : Number(e.target.value))}><option value="fit">Fit width</option><option value="page">Fit page</option>{[25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300].map(value => <option key={value} value={value}>{value}%</option>)}</select><ChevronDown size={12} /></div><button className="icon-button" onClick={() => setZoom(Math.min(300, Math.round(scale * 100 / 25) * 25 + 25))} disabled={scale >= 3} aria-label="Zoom in"><Plus size={16} /></button></div><span className="toolbar-divider" /><button className={`icon-button ${focusMode ? 'active' : ''}`} onClick={() => setFocusMode(value => !value)} aria-label={focusMode ? 'Exit focus mode' : 'Focus mode'} title={focusMode ? 'Exit focus mode' : 'Focus mode'}>{focusMode ? <Minimize2 size={17} /> : <Maximize size={17} />}</button></div>
      </div>

      <Inspector document={pdf} selected={selected} draft={draft} change={snapshot.changes.find(change => change.span_id === selected?.id)} dirty={dirty} applying={applying} error={error} editCount={snapshot.edits.length} onDraft={draft => { setDraft(draft); setError('') }} onApply={applyDraft} onRestore={restore} onClose={() => chooseSpan(null)} onFonts={() => setFontStudio(true)} onOCR={openOCR} onFocusSelection={focusSelection} fonts={libraryFonts} expanded={inspectorExpanded} onToggle={() => void toggleProperties()} onFidelity={() => setFidelityOpen(true)} />
    </div>
    <footer className="status-bar"><div><span className="status-dot" /><span>{IS_HOSTED ? 'Temporary server processing' : 'On your device'}</span><LockKeyhole size={12} /><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a></div><div><span>{snapshot.edits.length} {snapshot.edits.length === 1 ? 'text edit' : 'text edits'}</span><span className="status-separator">·</span><span>{Math.round(scale * 100)}%</span><span className="status-separator">·</span><span>reage v{APP_VERSION}</span></div></footer>
    {notice && <div className={`toast ${notice.startsWith('Export failed') ? 'toast-error' : ''}`} role="status">{notice.startsWith('Export failed') ? <AlertCircle size={17} /> : <Check size={17} />}<span>{notice}</span><button className="icon-button tiny" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    {help && <HelpDialog onClose={() => setHelp(false)} />}
    {commandsOpen && <CommandPalette commands={commands} onClose={() => setCommandsOpen(false)} />}
    {replaceOpen && <ReplaceDialog document={pdf} snapshot={snapshot} query={query} page={pageNumber} error={error} onApply={edits => session.commit(edits, null)} onClose={() => setReplaceOpen(false)} />}
    {fidelityOpen && <FidelityDialog document={pdf} snapshot={snapshot} onClose={() => setFidelityOpen(false)} />}
    {fontStudio && <FontStudio document={pdf} selected={selected} onChoose={chooseLibraryFont} onClose={() => setFontStudio(false)} />}
    {ocr && <OcrDialog document={pdf} page={pageNumber} onUpdate={setPdf} onClose={() => setOCR(false)} />}
  </div>
}

function TypeIcon() { return <TextCursorInput size={14} /> }
