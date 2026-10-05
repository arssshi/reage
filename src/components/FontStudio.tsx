import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Download, FolderOpen, Globe2, LoaderCircle, RefreshCw, Search, Type, Upload, X } from 'lucide-react'
import { api, messageOf } from '../api'
import type { FontEntry, FontMatches, PdfDocument, TextEdit, TextSpan } from '../types'
import { IS_HOSTED } from '../config'

interface Props {
  document: PdfDocument
  selected: TextSpan | null
  draft: TextEdit | null
  onChoose: (font: FontEntry) => void
  onAuto: () => void
  onClose: () => void
}

export default function FontStudio({ document, selected, draft, onChoose, onAuto, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [fonts, setFonts] = useState<FontEntry[]>([])
  const [families, setFamilies] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('')
  const [weight, setWeight] = useState((draft?.bold ?? selected?.bold) ? 700 : 400)
  const [italic, setItalic] = useState(draft?.italic ?? selected?.italic ?? false)
  const [busy, setBusy] = useState('Reading available fonts…')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState<'library' | 'download' | 'document' | 'match'>('library')
  const [matches, setMatches] = useState<FontMatches | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const catalogRequested = useRef(false)
  const alive = useRef(true)

  async function load(refresh = false) {
    setBusy('Reading available fonts…')
    setError('')
    try {
      const result = await api.fonts(refresh)
      if (alive.current) { setFonts(result.fonts); setFamilies(result.google_families) }
    } catch (error) { if (alive.current) setError(messageOf(error)) }
    finally { if (alive.current) setBusy('') }
  }
  useEffect(() => {
    alive.current = true
    dialog.current?.showModal()
    void load()
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    if (!selected) return
    setMatching(true)
    const controller = new AbortController()
    api.fontMatches(document.id, selected.id, draft?.text ?? selected.text, controller.signal).then(result => {
      if (!controller.signal.aborted) { setMatches(result); setFamily(value => value || result.downloads[0]?.family || result.search) }
    }).catch(error => { if (!controller.signal.aborted) setMatchError(messageOf(error)) }).finally(() => { if (!controller.signal.aborted) setMatching(false) })
    return () => controller.abort()
  }, [document.id, selected?.id])
  useEffect(() => {
    if (!['download', 'match'].includes(tab) || catalogRequested.current) return
    catalogRequested.current = true; setCatalogLoading(true)
    api.fontCatalog().then(result => { if (alive.current) setFamilies(result.families) }).catch(() => {}).finally(() => { if (alive.current) setCatalogLoading(false) })
  }, [tab])

  async function acquire(action: () => Promise<FontEntry>, description: string) {
    setBusy(description)
    setError('')
    setSuccess('')
    try {
      const entry = await action()
      if (!alive.current) return
      setFonts(items => [entry, ...items.filter(font => font.id !== entry.id)])
      setSuccess(`${entry.name} is ready${IS_HOSTED ? ' for this browser session.' : ' and cached locally.'}`)
      if (selected) onChoose(entry)
      else { setTab('library'); setQuery(entry.family) }
    } catch (error) { if (alive.current) setError(messageOf(error)) }
    finally { if (alive.current) setBusy('') }
  }

  const visible = fonts.filter(font => `${font.name} ${font.family} ${font.source}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100)
  const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const exactPublic = matches ? families.find(name => normalized(name) === normalized(matches.search)) : undefined
  const suggestions = matches?.downloads ?? []
  const downloads = exactPublic && !suggestions.some(entry => entry.family === exactPublic) ? [{ family: exactPublic, kind: 'exact', label: 'Matching public family' }, ...suggestions] : suggestions
  const detected = new Map<string, { name: string; status: string; pages: Set<number>; count: number }>()
  document.pages.forEach(page => page.spans.filter(span => span.source === 'native').forEach(span => {
    const key = `${span.font}:${span.font_status}`
    const entry = detected.get(key) ?? { name: span.font, status: span.font_status, pages: new Set<number>(), count: 0 }
    entry.pages.add(page.index + 1)
    entry.count++
    detected.set(key, entry)
  }))

  return <dialog className="recovery-dialog font-studio" aria-label="Font Studio" ref={dialog} onCancel={onClose}>
    <div className="recovery-dialog-header"><div className="type-avatar"><Type size={23} /></div><div><h2>Font Studio</h2><p>Original fonts first. The right alternatives when you need them.</p></div><button className="icon-button" onClick={onClose} aria-label="Close Font Studio"><X size={19} /></button></div>
    {selected && <div className="font-selection-note"><span>PDF font</span><strong>{selected.font}</strong><small>{selected.font_status === 'estimated' ? 'The original font was not stored in this image.' : `Detected as ${selected.font_status}. Auto checks the original, matching local fonts, then substitutes.`}</small></div>}
    <div className="recovery-tabs"><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><FolderOpen size={15} /> {IS_HOSTED ? 'Session fonts' : 'On this device'} <span>{fonts.length}</span></button>{selected && <button className={tab === 'match' ? 'active' : ''} onClick={() => setTab('match')}>Recover this font</button>}<button className={tab === 'download' ? 'active' : ''} onClick={() => setTab('download')}><Globe2 size={15} /> Get open fonts</button><button className={tab === 'document' ? 'active' : ''} onClick={() => setTab('document')}>PDF diagnosis</button></div>
    <div className="recovery-dialog-body">
      {tab === 'library' && <>
        {selected && <button className="font-recovery-callout" onClick={() => setTab('match')}><Search size={20} /><span><strong>Find the best match for this text</strong><small>Embedded companions, complete local faces, and open-font recovery.</small></span><span>Explore →</span></button>}
        <div className="font-search"><Search size={16} /><input aria-label="Search fonts" placeholder="Search family, style, or source…" value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" disabled={!!busy} onClick={() => void load(true)} aria-label="Rescan installed fonts"><RefreshCw size={15} /></button></div>
        <p className="recovery-help">{IS_HOSTED ? 'Bundled Noto / FiraGO fonts and fonts added to this tab. Upload a font to use one from your computer.' : 'System fonts, bundled Noto / FiraGO fonts, and your cached downloads.'} {selected ? 'Choose a font to apply it to the current draft.' : 'Select text on the page to assign a font. Auto recovery can use these fonts.'}</p>
        <div className="font-list">{visible.map(font => <button className="font-list-item" key={font.id} disabled={!!busy || !selected} onClick={() => onChoose(font)}><Type size={18} /><span><strong>{font.name}</strong><small>{font.style || font.family}</small></span><em>{font.source}</em>{selected && <span className="font-use">Use →</span>}</button>)}{!visible.length && !busy && <p className="recovery-help">No matching local fonts. Upload the font file or get an open font.</p>}</div>
      </>}
      {tab === 'match' && selected && <>
        <div className="font-match-summary"><span className="font-match-aa" aria-hidden="true">Aa</span><div><h3>{selected.font.replace(/^[A-Z]{6}\+/, '')}</h3><p>{matches?.subset ? 'Embedded subset · only the stored glyphs are guaranteed.' : selected.font_status === 'unavailable' ? 'The original font program is missing from the PDF.' : selected.source === 'ocr' || selected.source === 'region' ? 'Typography is estimated from the visible page.' : 'Font identity is read directly from the PDF resources.'}</p>{!!matches?.missing.length && <small>Missing original glyphs: {matches.missing.join(' ')}</small>}</div></div>
        <button className="button secondary font-auto-button" disabled={!!busy} onClick={onAuto}><RefreshCw size={16} /> Use automatic font recovery</button>
        {matching && <div className="font-operation"><LoaderCircle size={16} className="spin" />Checking matching faces and glyph coverage…</div>}
        {catalogLoading && <div className="font-operation"><LoaderCircle size={16} className="spin" />Looking for a complete face in the public catalog…</div>}
        {matchError && <div className="notice error"><AlertCircle size={16} /><span>{matchError}</span></div>}
        {!!matches?.candidates.length && <><h3 className="font-match-heading">Available matching faces</h3><div className="font-list">{matches.candidates.map((font, index) => <button className="font-list-item" key={`${font.id}:${index}`} disabled={!!busy} onClick={() => onChoose(font)}><Type size={18} /><span><strong>{font.name}</strong><small>{font.style} · covers the current text</small></span><em>{font.source}</em><span className="font-use">Use →</span></button>)}</div></>}
        {!!downloads.length && <><h3 className="font-match-heading">Download a complete open face</h3><div className="font-download-matches">{downloads.map(entry => <button key={entry.family} disabled={!!busy} onClick={() => void acquire(() => api.fetchFont(entry.family, weight, italic), `Downloading ${entry.family}…`)}><Download size={18} /><span><strong>{entry.family}</strong><small>{entry.label} · {weight === 700 ? 'Bold' : 'Regular'}{italic ? ' Italic' : ''}</small></span><span>Get font</span></button>)}</div></>}
        <p className="recovery-help font-match-help">A matching name can still mean a different version. Font subsets and scans do not contain every original outline. Review your result, or upload the complete original face.</p>
        <button className="text-button" onClick={() => setTab('download')}>Search the open-font catalog →</button>
      </>}
      {tab === 'download' && <>
        <p className="recovery-help">Browse {families.length > 100 ? `${families.length.toLocaleString()} open families` : 'open families'} from Google Fonts. Choose a face and download it directly into your workspace. Your PDF is never sent to the font provider.</p>
        <label className="input-label" htmlFor="download-family">Exact family name</label><input className="recovery-input" id="download-family" list="google-font-families" placeholder="e.g. Carlito, Noto Sans, Roboto" value={family} onChange={event => setFamily(event.target.value)} /><datalist id="google-font-families">{families.map(name => <option key={name} value={name} />)}</datalist>
        {catalogLoading && <span className="field-helper">Loading the complete public font catalog…</span>}
        <div className="download-options"><label>Weight <select aria-label="Downloaded font weight" value={weight} onChange={event => setWeight(Number(event.target.value))}><option value={400}>Regular</option><option value={700}>Bold</option></select></label><label><input type="checkbox" checked={italic} onChange={event => setItalic(event.target.checked)} /> Italic</label></div>
        <button className="button primary" disabled={!!busy || !family.trim()} onClick={() => void acquire(() => api.fetchFont(family.trim(), weight, italic), 'Downloading and preparing the font…')}><Download size={16} /> Download font</button>
        <div className="font-compatible"><h3>Useful metric-compatible alternatives</h3>{[['Calibri', 'Carlito'], ['Cambria', 'Caladea'], ['Arial', 'Arimo'], ['Times New Roman', 'Tinos'], ['Courier New', 'Cousine']].map(([original, replacement]) => <button key={original} onClick={() => setFamily(replacement)}><span>{original}</span><span>→</span><strong>{replacement}</strong></button>)}<p>These are substitutes, not identical original fonts. Review the rendered result.</p></div>
      </>}
      {tab === 'document' && <>
        <p className="recovery-help">A font name and a usable font program are different things. This report distinguishes embedded fonts, repaired encodings, and fonts missing from the file.</p>
        <div className="font-report">{[...detected.values()].map(entry => <div key={`${entry.name}:${entry.status}`}><strong>{entry.name}</strong><span className={`diagnostic-tag ${entry.status === 'unavailable' ? 'missing' : ''}`}>{entry.status === 'unavailable' ? 'Font program missing' : entry.status === 'repaired' ? 'Unicode map repaired' : entry.status}</span><small>{entry.count} text runs · pages {[...entry.pages].join(', ')}</small></div>)}</div>
        {!detected.size && <div className="notice amber"><AlertCircle size={18} /><span>This PDF has no native text fonts. Its letters may be pixels or vector outlines. Use Scan text (OCR), then review the estimated font, or draw a replacement region.</span></div>}
        <div className="recovery-help">{document.pages.filter(page => page.needs_ocr).length} pages currently need OCR or region recovery.</div>
      </>}
      {busy && <div className="font-operation" role="status"><LoaderCircle className="spin" size={17} />{busy}</div>}
      {error && <div className="notice error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="notice success" role="status"><Check size={16} /><span>{success}</span></div>}
    </div>
    <div className="recovery-dialog-footer"><input ref={input} type="file" accept=".ttf,.otf" className="visually-hidden" aria-label="Upload font file" onChange={event => { const file = event.target.files?.[0]; if (file) void acquire(() => api.uploadFont(file), 'Reading the font file…'); event.target.value = '' }} /><button className="button secondary" disabled={!!busy} onClick={() => input.current?.click()}><Upload size={15} /> Upload TTF / OTF</button><span>{IS_HOSTED ? 'Kept in this tab until you close the document.' : 'Cached on this device. Available next time.'}</span></div>
  </dialog>
}
