import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Crop, Download, Eye, FilePlus2, FileText, Fingerprint, Focus, History, LoaderCircle, LockKeyhole, Maximize, Minimize2, Minus, MousePointer2, Move, PanelLeftClose, PanelLeftOpen, Plus, Redo2, ScanText, Search, TextCursorInput, Type, Undo2, X } from 'lucide-react'
import { api, APP_VERSION, messageOf } from './api'
import { GITHUB_URL, IS_HOSTED } from './config'
import type { Box, ExportOptions, FontEntry, PdfDocument, TextEdit, TextSpan, WorkspaceTool } from './types'
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
import FormattingBar from './components/FormattingBar'
import ExportDialog from './components/ExportDialog'

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
  const inlineEpoch = useRef(0)
  const [exporting, setExporting] = useState(false)
  const [help, setHelp] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(initialTool === 'replace')
  const [fidelityOpen, setFidelityOpen] = useState(false)
  const [exportOptionsOpen, setExportOptionsOpen] = useState(initialTool === 'pages')
  const [showOriginal, setShowOriginal] = useState(false)
  const [sidePanel, setSidePanel] = useState<'pages' | 'search' | 'history'>('pages')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1050)
  const [inspectorExpanded, setInspectorExpanded] = useState(() => window.innerWidth > 720)
  const [focusMode, setFocusMode] = useState(false)
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState<'edit' | 'move' | 'view' | 'region' | 'add'>(initialTool === 'add' ? 'add' : 'edit')
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
    const epoch = ++inlineEpoch.current
    if (operationBusy || !await session.select(span)) return
    if (epoch !== inlineEpoch.current) return
    setInlineActive(!!span?.editable && caret !== undefined)
    setInlineCaret(caret ?? null)
    if (span) {
      setPageNumber(span.page); setTool(tool === 'move' ? 'move' : 'edit'); setShowOriginal(false)
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
    if (await session.moveHistory(next - cursor)) {
      inlineEpoch.current++
      setInlineActive(false)
    }
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
      const result = tool === 'add' ? await api.addText(pdf.id, pageNumber, box) : await api.addRegion(pdf.id, pageNumber, box)
      setPdf(result.document)
      const span = result.document.pages[pageNumber].spans.find(span => span.id === result.span_id)!
      await session.select(span)
      setDraft({ ...originalEdit(span), background: span.background }, tool === 'add')
      setInspectorExpanded(window.innerWidth > 720 || tool !== 'add')
      if (tool === 'add') { setInlineCaret(0); setInlineActive(true); setFocusRequest(value => value + 1) }
      setTool('edit')
    } catch (error) { setNotice(`Region: ${messageOf(error)}`) }
    finally { setOperationBusy(false) }
  }

  function chooseLibraryFont(font: FontEntry) {
    if (font.id !== 'original') setLibraryFonts(fonts => [font, ...fonts.filter(entry => entry.id !== font.id)])
    const latest = session.latest().draft
    if (latest) { setDraft({ ...latest, font: font.id, bold: font.weight >= 600, italic: font.italic }); setError('') }
    setFontStudio(false)
  }

  async function finishInline() {
    const epoch = inlineEpoch.current
    const before = session.latest()
    if (before.automatic && !await session.flush()) return false
    if (epoch === inlineEpoch.current && session.latest().draft?.span_id === before.draft?.span_id) setInlineActive(false)
    return true
  }

  function changeInline(text: string) {
    inlineEpoch.current++
    const latest = session.latest().draft
    if (latest) setDraft({ ...latest, text }, true)
  }

  async function openReplace() {
    if (!await session.select(null)) return
    setInlineActive(false); setReplaceOpen(true)
  }

  async function switchMode(next: 'edit' | 'view' | 'move' | 'add') {
    if (next === 'move') {
      if (!await session.flush()) return
      setInlineActive(false); setTool('move'); setShowOriginal(false); return
    }
    if (!await session.select(null)) return
    setInlineActive(false); setTool(next); setShowOriginal(false)
  }

  async function changeSelection(patch: Partial<TextEdit>) {
    if (operationBusy || showOriginal || session.composing) return
    inlineEpoch.current++; setInlineActive(false)
    await session.transform(patch)
  }

  function toggleStyle(property: 'bold' | 'italic' | 'underline') {
    const latest = session.latest()
    if (!latest.draft || !selected?.editable) return
    const change = latest.snapshot.changes.find(change => change.span_id === selected.id)
    const value = latest.draft[property] ?? (property === 'underline' ? false : change?.[property] ?? selected[property])
    void changeSelection({ [property]: !value })
  }

  function nudge(dx: number, dy: number) {
    const latest = session.latest().draft
    if (!latest || !selected?.editable || operationBusy || showOriginal) return
    setInlineActive(false)
    setDraft({ ...latest, offset_x: (latest.offset_x ?? 0) + dx, offset_y: (latest.offset_y ?? 0) + dy }, true)
  }

  async function duplicateText() {
    if (operationBusy || !selected?.editable || !await session.flush()) return
    const latest = session.latest()
    const edit = latest.draft
    const source = selected
    const verified = latest.snapshot.changes.find(change => change.span_id === source.id)
    if (!edit?.text) return
    const bbox = verified?.bbox ?? source.bbox
    const w = Math.max(2, bbox[2] - bbox[0]), h = Math.max(2, bbox[3] - bbox[1])
    const active = new Map(latest.snapshot.changes.map(change => [change.span_id, change]))
    let target: Box | null = null
    for (let y = bbox[3] + 10; y + h < page.height; y += h + 10) {
      const candidate: Box = [Math.max(0, Math.min(bbox[0], page.width - w)), y, Math.min(page.width, bbox[0] + w), y + h]
      if (!page.spans.some(span => { const change = active.get(span.id); if (!(change?.text ?? span.text)) return false; const b = change?.bbox ?? span.bbox; return candidate[0] < b[2] && candidate[2] > b[0] && candidate[1] < b[3] && candidate[3] > b[1] })) { target = candidate; break }
    }
    if (!target) { setNotice('No free space below this text. Add a text box elsewhere on the page.'); return }
    setOperationBusy(true)
    try {
      const result = await api.addText(pdf.id, pageNumber, target, source.id)
      setPdf(result.document)
      const added = result.document.pages[pageNumber].spans.find(span => span.id === result.span_id)!
      await session.select(added)
      const origin = verified?.origin ?? [source.origin[0] + (edit.offset_x ?? 0), source.origin[1] + (edit.offset_y ?? 0)]
      setDraft({ ...edit, span_id: added.id, fit: false, align: 'left', background: null, rotation: verified?.rotation ?? edit.rotation ?? source.rotation ?? 0, offset_x: Math.round((target[0] + origin[0] - bbox[0] - added.origin[0]) * 100) / 100, offset_y: Math.round((target[1] + origin[1] - bbox[1] - added.origin[1]) * 100) / 100 })
      if (await session.applyDraft()) { setInlineActive(false); setTool('move'); setNotice('Text duplicated. Drag its handle to place it.'); setFocusRequest(value => value + 1) }
    } catch (error) { setNotice(`Duplicate: ${messageOf(error)}`) }
    finally { setOperationBusy(false) }
  }

  async function compareOriginal() {
    if (!await finishInline()) return
    setShowOriginal(value => !value)
  }

  async function openExportOptions() {
    if (!await finishInline()) return
    if (session.latest().dirty) { setError('Apply or restore your current text changes before exporting.'); return }
    setExportOptionsOpen(true)
  }

  async function toggleProperties() {
    await finishInline()
    setInspectorExpanded(value => !value)
    setFocusRequest(value => value + 1)
  }

  async function download(options: ExportOptions = {}): Promise<boolean> {
    if (exporting || operationBusy) return false
    setExporting(true)
    try {
      await session.wait()
      if (session.latest().automatic && !await session.flush()) return false
      const latest = session.latest()
      if (latest.dirty) { setError('Apply or restore your current text changes before exporting.'); return false }
      const blob = await api.export(pdf.id, latest.snapshot.edits, options)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = options.filename || `${pdf.name.replace(/\.pdf$/i, '')}-edited.pdf`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      const included = new Set(options.pages?.map(entry => entry.page) ?? pdf.pages.map(page => page.index))
      const savedAllEdits = latest.snapshot.edits.every(edit => {
        const span = allSpans.find(span => span.id === edit.span_id)
        return !!span && included.has(span.page)
      })
      if (savedAllEdits) setExported(JSON.stringify(latest.snapshot.edits))
      setNotice(savedAllEdits ? 'Your edited PDF has been downloaded.' : 'Selected pages downloaded. Other page edits still need exporting.')
      return true
    } catch (error) { setNotice(`Export failed: ${messageOf(error)}`); return false }
    finally { setExporting(false) }
  }

  function dismissWorkspaceLayer() {
    if (focusMode) setFocusMode(false)
    else if (sidebarOpen && window.innerWidth <= 1050) setSidebarOpen(false)
    else void chooseSpan(null)
  }
  const canNudge = !!selected?.editable && !showOriginal
  const handlers = useRef({ download, moveHistory, dismissWorkspaceLayer, onOpen, cursor, toggleStyle, nudge, switchMode, duplicateText, changeSelection, canNudge })
  handlers.current = { download, moveHistory, dismissWorkspaceLayer, onOpen, cursor, toggleStyle, nudge, switchMode, duplicateText, changeSelection, canNudge }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.isComposing) return
      const dialogOpen = !!window.document.querySelector('dialog[open]')
      if (dialogOpen) return
      const inInput = (event.target as HTMLElement).matches('input, textarea, select, [contenteditable="true"]')
      const onPage = (event.target as HTMLElement).getAttribute('aria-label') === 'Edit text on page'
      if (modifier && (!inInput || onPage) && ['b', 'i', 'u'].includes(key)) { event.preventDefault(); handlers.current.toggleStyle(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline'); return }
      if (modifier && !inInput && key === 'd') { event.preventDefault(); void handlers.current.duplicateText(); return }
      if (!modifier && !inInput && !event.altKey) {
        const step = event.shiftKey ? 10 : 1
        if (handlers.current.canNudge && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); handlers.current.nudge(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0); return }
        if (key === 't') { event.preventDefault(); void handlers.current.switchMode('add'); return }
        if (key === 'v') { event.preventDefault(); void handlers.current.switchMode('move'); return }
        if (key === 'e') { event.preventDefault(); void handlers.current.switchMode('edit'); return }
        if (handlers.current.canNudge && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); void handlers.current.changeSelection({ text: '' }); return }
      }
      if (modifier && key === 'k') { event.preventDefault(); setCommandsOpen(value => !value); return }
      if (modifier && key === 's') { event.preventDefault(); void handlers.current.download() }
      if (modifier && key === 'o') { event.preventDefault(); handlers.current.onOpen() }
      if (modifier && key === 'f') { event.preventDefault(); setSidebarOpen(true); setSidePanel('search'); searchInput.current?.focus() }
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
    { name: 'Organize pages & export options', group: 'Document', run: () => void openExportOptions() },
    { name: 'Find text', group: 'Navigate', shortcut: '⌘ / Ctrl F', run: () => openPanel('search') },
    { name: 'Find and replace', group: 'Edit', run: () => void openReplace() },
    { name: 'Show pages', group: 'Navigate', run: () => openPanel('pages') },
    { name: 'Edit history', group: 'Document', run: () => openPanel('history') },
    { name: 'Review edit fidelity', group: 'Document', run: () => setFidelityOpen(true) },
    { name: 'Undo', group: 'Edit', shortcut: '⌘ / Ctrl Z', run: () => void moveHistory(cursor - 1), disabled: !cursor && !dirty },
    { name: 'Redo', group: 'Edit', run: () => void moveHistory(cursor + 1), disabled: cursor === history.length - 1 },
    { name: 'Font Studio', group: 'Typography', run: () => setFontStudio(true) },
    { name: 'Add text', group: 'Edit', shortcut: 'T', run: () => void switchMode('add') },
    { name: 'Move text', group: 'Edit', shortcut: 'V', run: () => void switchMode('move') },
    { name: 'Duplicate selected text', group: 'Edit', shortcut: '⌘ / Ctrl D', run: () => void duplicateText(), disabled: !selected?.editable },
    { name: 'Bold', group: 'Typography', shortcut: '⌘ / Ctrl B', run: () => toggleStyle('bold'), disabled: !selected?.editable },
    { name: 'Italic', group: 'Typography', shortcut: '⌘ / Ctrl I', run: () => toggleStyle('italic'), disabled: !selected?.editable },
    { name: 'Underline', group: 'Typography', shortcut: '⌘ / Ctrl U', run: () => toggleStyle('underline'), disabled: !selected?.editable },
    { name: showOriginal ? 'Show edited PDF' : 'Compare original', group: 'View', run: () => void compareOriginal() },
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
      <div className="header-actions"><button className="command-trigger" onClick={() => setCommandsOpen(true)} aria-label="Open command palette" title="Commands (Ctrl / ⌘ K)"><Search size={17} /><span>Quick actions</span><kbd>⌘ K</kbd></button><button className="icon-button open-button" onClick={onOpen} aria-label="Open PDF" title="Open another PDF"><FilePlus2 size={19} /></button><div className="export-split"><button className="button primary" onClick={() => void download()} disabled={exporting || operationBusy}>{exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}<span>{exporting ? 'Exporting…' : 'Export PDF'}</span></button><button className="export-options-button" aria-label="Export options" title="Organize pages and export options" disabled={exporting || operationBusy} onClick={() => void openExportOptions()}><ChevronDown size={16} /></button></div></div>
    </header>

    <div className="editor-toolbar">
      <div className="toolbar-group toolbar-history"><button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>{sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</button><span className="toolbar-divider" /><button className="icon-button" onClick={() => moveHistory(cursor - 1)} disabled={cursor === 0 || applying} title="Undo (Ctrl / ⌘ Z)" aria-label="Undo"><Undo2 size={18} /></button><button className="icon-button" onClick={() => moveHistory(cursor + 1)} disabled={cursor === history.length - 1 || applying} title="Redo (Ctrl / ⌘ Shift Z)" aria-label="Redo"><Redo2 size={18} /></button></div>
      <div className="workspace-tools recovery-toolbar" role="toolbar" aria-label="PDF editing tools"><button className={`workspace-tool ${tool === 'edit' ? 'active' : ''}`} onClick={() => void switchMode('edit')} disabled={applying} aria-pressed={tool === 'edit'} title="Edit text (E)"><TextCursorInput size={18} /><span>Edit text</span></button><button className={`workspace-tool ${tool === 'move' ? 'active' : ''}`} onClick={() => void switchMode('move')} disabled={applying} aria-pressed={tool === 'move'} title="Select and move text (V)"><Move size={18} /><span>Move text</span></button><button className={`workspace-tool ${tool === 'add' ? 'active' : ''}`} onClick={() => void switchMode('add')} disabled={applying} aria-pressed={tool === 'add'} title="Click or draw a text box (T)"><Plus size={18} /><span>Add text</span></button><span className="toolbar-divider" /><button className="workspace-tool" onClick={() => setFontStudio(true)} disabled={applying}><Type size={18} /><span>Font Studio</span></button><button className="workspace-tool" onClick={openOCR} disabled={applying} aria-label="Scan text (OCR)"><ScanText size={18} /><span>Scan text</span><small>OCR</small></button><button className={`workspace-tool ${tool === 'region' ? 'active' : ''}`} onClick={startRegion} disabled={applying} aria-pressed={tool === 'region'}><Crop size={18} /><span>Replace region</span></button></div>
      <button className="fidelity-trigger" onClick={() => setFidelityOpen(true)} title="Review applied edit fidelity"><Fingerprint size={17} /><span>Fidelity report</span></button>
    </div>
    <FormattingBar selected={selected} draft={draft} change={snapshot.changes.find(change => change.span_id === selected?.id)} busy={applying || showOriginal || session.composing} onChange={patch => void changeSelection(patch)} onFonts={() => setFontStudio(true)} onMove={() => void switchMode('move')} onDuplicate={() => void duplicateText()} onDelete={() => void changeSelection({ text: '' })} onProperties={() => void toggleProperties()} moving={tool === 'move'} />

    <div className="editor-body">
      <nav className="activity-rail" aria-label="Workspace panels"><div><button className={`rail-button ${sidebarOpen && sidePanel === 'pages' ? 'active' : ''}`} onClick={() => openPanel('pages')} title="Pages" aria-label="Pages panel"><FileText size={20} /><span>Pages</span></button><button className={`rail-button ${sidebarOpen && sidePanel === 'search' ? 'active' : ''}`} onClick={() => openPanel('search')} title="Find text" aria-label="Find text"><Search size={20} /><span>Find</span></button><button className={`rail-button ${sidebarOpen && sidePanel === 'history' ? 'active' : ''}`} onClick={() => openPanel('history')} title="Edit history" aria-label="Edit history"><History size={20} /><span>History</span></button></div><button className="rail-button" onClick={() => setHelp(true)} title="Help & keyboard shortcuts" aria-label="Help & keyboard shortcuts"><CircleHelp size={20} /><span>Help</span></button></nav>
      {sidebarOpen && <button className="panel-scrim" aria-label="Close navigation panel" onClick={() => setSidebarOpen(false)} />}
      {sidebarOpen && <aside className="left-panel" aria-label={sidePanel}>
        <div className="panel-heading"><span>{sidePanel === 'pages' ? 'Pages' : sidePanel === 'search' ? 'Find in document' : 'Edit history'}</span><span className="count-badge">{sidePanel === 'pages' ? pdf.page_count : sidePanel === 'search' ? results.length : snapshot.edits.length}</span><button className="icon-button tiny panel-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><X size={16} /></button></div>
        {sidePanel === 'search' && <button className="replace-launch" onClick={() => void openReplace()}>Find and replace <ArrowRight size={13} /></button>}
        {sidePanel === 'pages' && <button className="replace-launch" onClick={() => void openExportOptions()}>Organize & export <ArrowRight size={13} /></button>}
        {sidePanel === 'pages' && <><div className="thumbnails">{pdf.pages.map(thumbnail => <button key={thumbnail.index} className={`thumbnail-button ${thumbnail.index === pageNumber ? 'active' : ''}`} onClick={() => navigate(thumbnail.index)} aria-label={`Go to page ${thumbnail.index + 1}`} aria-current={thumbnail.index === pageNumber ? 'page' : undefined}><div className="thumbnail-frame"><PdfPreview documentId={pdf.id} page={thumbnail} edits={snapshot.edits} scale={132 / thumbnail.width} thumbnail />{thumbnail.spans.some(span => editMap.has(span.id)) && <span className="edited-indicator" title="Contains edits" />}</div><span className="thumbnail-label">{thumbnail.index + 1}{thumbnail.index === pageNumber && <span>Current page</span>}</span></button>)}</div><div className="sidebar-bottom"><LockKeyhole size={13} /> A private little workspace.</div></>}
        {sidePanel === 'search' && <><div className="search-field"><Search size={15} /><input ref={searchInput} placeholder="Search document…" aria-label="Search document" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-button tiny" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</div><div className="search-results">{results.map(span => <button key={span.id} className={`search-result ${selected?.id === span.id ? 'active' : ''}`} onClick={() => chooseSpan(span)}><span>PAGE {span.page + 1}</span><p>{editMap.get(span.id)?.text ?? span.text}</p><ArrowRight size={13} /></button>)}{!results.length && <div className="panel-empty"><Search size={25} /><strong>{query ? 'No matches found' : 'Find the right words.'}</strong><p>{query ? 'Try a different word or phrase.' : 'Search text across every page in your PDF.'}</p></div>}{results.length === 100 && <p className="search-limit">Showing the first 100 matches.</p>}</div></>}
        {sidePanel === 'history' && <div className="history-panel"><div className="history-header"><div><span className="status-dot" /><strong>{cursor} applied {cursor === 1 ? 'step' : 'steps'}</strong></div><p>Undo and redo any applied edit during this session.</p></div><div className="history-controls"><button className="button secondary small" disabled={!cursor || applying} onClick={() => moveHistory(cursor - 1)}><Undo2 size={14} /> Undo</button><button className="button secondary small" disabled={cursor === history.length - 1 || applying} onClick={() => moveHistory(cursor + 1)}><Redo2 size={14} /> Redo</button></div>{snapshot.edits.map(edit => { const span = allSpans.find(span => span.id === edit.span_id)!; return <button className="history-item" key={edit.span_id} onClick={() => chooseSpan(span)}><div><TypeIcon /><span>Page {span.page + 1}</span><Check size={13} /></div><del>{span.text}</del><p>{edit.text || 'Text deleted'}</p></button> })}{!snapshot.edits.length && <div className="panel-empty"><History size={27} /><strong>A fresh start.</strong><p>Your applied text edits will appear here.</p></div>}</div>}
      </aside>}

      <div className="canvas-area"><main ref={canvas} className={`document-canvas ${tool === 'view' ? 'view-mode' : ''}`} aria-label="PDF canvas" onClick={() => chooseSpan(null)}>
        {page.needs_ocr && <div className="ocr-page-banner" onClick={event => event.stopPropagation()}><ScanText size={21} /><div><strong>{page.text_kind === 'image' ? 'This page is an image, not a text layer.' : 'This page needs text recovery.'}</strong><p>Recognize the words with local OCR, or draw a region to replace visible text.</p></div><button className="button primary small" onClick={openOCR}>Recognize text</button></div>}
        <div className="canvas-topline"><span>{showOriginal ? <Eye size={14} /> : tool === 'region' ? <Crop size={14} /> : tool === 'add' ? <Plus size={14} /> : tool === 'move' ? <Move size={14} /> : tool === 'edit' ? <TextCursorInput size={14} /> : <MousePointer2 size={14} />}{showOriginal ? 'Original PDF · comparison view' : tool === 'region' ? 'Draw around the text you want to replace' : tool === 'add' ? 'Click anywhere, or draw a text box' : tool === 'move' ? 'Select text, then drag its move or resize handle' : tool === 'edit' ? inlineActive ? 'Type naturally. Press Enter to finish.' : 'Click any text to make a change' : 'A clear view of your document'}</span><div className="canvas-view-actions"><button className={`canvas-compare ${showOriginal ? 'active' : ''}`} onClick={event => { event.stopPropagation(); void compareOriginal() }} aria-label="Compare original" aria-pressed={showOriginal} title="Toggle the original PDF"><Eye size={15} /><span>{showOriginal ? 'Back to edits' : 'Original'}</span></button><button className={`canvas-boundaries ${showBounds ? 'active' : ''}`} onClick={event => { event.stopPropagation(); setShowBounds(value => !value) }} title="Show all text boundaries" aria-label="Show text boundaries" aria-pressed={showBounds}><Focus size={16} /><span>Text boundaries</span></button></div></div>
        <div className="page-stage"><PdfPreview key={pageNumber} documentId={pdf.id} page={page} edits={showOriginal ? [] : snapshot.edits} changes={showOriginal ? [] : snapshot.changes} scale={scale} selected={showOriginal ? undefined : selected?.id} showBounds={!showOriginal && showBounds} interactive={!showOriginal && (tool === 'edit' || tool === 'move')} moveMode={tool === 'move'} onSelect={chooseSpan} regionMode={!showOriginal && (tool === 'region' || tool === 'add')} addMode={tool === 'add'} onRegion={box => void createRegion(box)} selectionDraft={draft} transformDisabled={applying} onTransform={patch => void changeSelection(patch)} inlineDraft={inlineActive && !showOriginal ? draft : null} inlineCaret={inlineCaret} inlineError={error} onInlineChange={changeInline} onInlineCommit={() => void finishInline()} onComposition={session.composition} onInlineClose={() => void finishInline()} /></div>
        <div className="canvas-bottom"><span>{page.width.toFixed(0)} × {page.height.toFixed(0)} pt</span><span>Page {pageNumber + 1} of {pdf.page_count}</span></div>
      </main>
      <div className="canvas-dock" aria-label="Page and zoom controls"><div className="page-controls"><button className="icon-button" onClick={() => navigate(pageNumber - 1)} disabled={pageNumber === 0} aria-label="Previous page"><ChevronLeft size={17} /></button><select aria-label="Current page" value={pageNumber} onChange={e => navigate(Number(e.target.value))}>{pdf.pages.map(page => <option key={page.index} value={page.index}>{page.index + 1}</option>)}</select><span className="subtle">/ {pdf.page_count}</span><button className="icon-button" onClick={() => navigate(pageNumber + 1)} disabled={pageNumber === pdf.page_count - 1} aria-label="Next page"><ChevronRight size={17} /></button></div><span className="toolbar-divider" /><div className="zoom-controls"><button className="icon-button" onClick={() => setZoom(Math.max(25, Math.round(scale * 100 / 25) * 25 - 25))} disabled={scale <= .25} aria-label="Zoom out"><Minus size={16} /></button><div className="zoom-select"><select aria-label="Zoom" value={zoom} onChange={e => setZoom(['fit', 'page'].includes(e.target.value) ? e.target.value as 'fit' | 'page' : Number(e.target.value))}><option value="fit">Fit width</option><option value="page">Fit page</option>{[25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300].map(value => <option key={value} value={value}>{value}%</option>)}</select><ChevronDown size={12} /></div><button className="icon-button" onClick={() => setZoom(Math.min(300, Math.round(scale * 100 / 25) * 25 + 25))} disabled={scale >= 3} aria-label="Zoom in"><Plus size={16} /></button></div><span className="toolbar-divider" /><button className={`icon-button ${focusMode ? 'active' : ''}`} onClick={() => setFocusMode(value => !value)} aria-label={focusMode ? 'Exit focus mode' : 'Focus mode'} title={focusMode ? 'Exit focus mode' : 'Focus mode'}>{focusMode ? <Minimize2 size={17} /> : <Maximize size={17} />}</button></div>
      </div>

      <Inspector document={pdf} selected={selected} draft={draft} change={snapshot.changes.find(change => change.span_id === selected?.id)} dirty={dirty} applying={applying} automatic={inlineActive} error={error} editCount={snapshot.edits.length} onDraft={draft => { setDraft(draft); setError('') }} onApply={applyDraft} onRestore={restore} onClose={() => chooseSpan(null)} onFonts={() => setFontStudio(true)} onOCR={openOCR} onFocusSelection={focusSelection} fonts={libraryFonts} expanded={inspectorExpanded} onToggle={() => void toggleProperties()} onFidelity={() => setFidelityOpen(true)} />
    </div>
    <footer className="status-bar"><div><span className="status-dot" /><span>{IS_HOSTED ? 'Temporary server processing' : 'On your device'}</span><LockKeyhole size={12} /><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a></div><div><span>{snapshot.edits.length} {snapshot.edits.length === 1 ? 'text edit' : 'text edits'}</span><span className="status-separator">·</span><span>{Math.round(scale * 100)}%</span><span className="status-separator">·</span><span>reage v{APP_VERSION}</span></div></footer>
    {notice && <div className={`toast ${notice.startsWith('Export failed') ? 'toast-error' : ''}`} role="status">{notice.startsWith('Export failed') ? <AlertCircle size={17} /> : <Check size={17} />}<span>{notice}</span><button className="icon-button tiny" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    {help && <HelpDialog onClose={() => setHelp(false)} />}
    {commandsOpen && <CommandPalette commands={commands} onClose={() => setCommandsOpen(false)} />}
    {replaceOpen && <ReplaceDialog document={pdf} snapshot={snapshot} query={query} page={pageNumber} error={error} onApply={edits => session.commit(edits, null)} onClose={() => setReplaceOpen(false)} />}
    {fidelityOpen && <FidelityDialog document={pdf} snapshot={snapshot} onClose={() => setFidelityOpen(false)} />}
    {fontStudio && <FontStudio document={pdf} selected={selected} draft={draft} onChoose={chooseLibraryFont} onAuto={() => { if (draft) setDraft({ ...draft, font: 'auto' }); setFontStudio(false) }} onClose={() => setFontStudio(false)} />}
    {exportOptionsOpen && <ExportDialog document={pdf} snapshot={snapshot} currentPage={pageNumber} onDownload={download} onClose={() => setExportOptionsOpen(false)} />}
    {ocr && <OcrDialog document={pdf} page={pageNumber} onUpdate={setPdf} onClose={() => setOCR(false)} />}
  </div>
}

function TypeIcon() { return <TextCursorInput size={14} /> }
