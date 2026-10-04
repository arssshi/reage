import { useEffect, useState } from 'react'
import { AlertCircle, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, FileText, Fingerprint, Focus, LoaderCircle, LockKeyhole, RotateCcw, ScanText, SlidersHorizontal, TextCursorInput, Trash2, Type, X } from 'lucide-react'
import { api, messageOf } from '../api'
import type { Change, FontEntry, FontProbe, PdfDocument, TextEdit, TextSpan } from '../types'

interface Props {
  document: PdfDocument; selected: TextSpan | null; draft: TextEdit | null; change?: Change
  dirty: boolean; applying: boolean; error: string; editCount: number
  onDraft: (draft: TextEdit) => void; onApply: () => void; onRestore: () => void; onClose: () => void
  onFonts: () => void; onOCR: () => void; onFocusSelection: () => void; fonts: FontEntry[]
  expanded: boolean; onToggle: () => void; onFidelity: () => void
}

export default function Inspector({ document, selected, draft, change, dirty, applying, error, editCount, onDraft, onApply, onRestore, onClose, onFonts, onOCR, onFocusSelection, fonts, expanded, onToggle, onFidelity }: Props) {
  const fontNames = [...new Set(document.pages.flatMap(page => page.spans.filter(span => span.source === 'native').map(span => span.font)))]
  const editableCount = document.pages.reduce((count, page) => count + page.spans.filter(span => span.editable).length, 0)
  const [probe, setProbe] = useState<FontProbe | null>(null)
  const [probeError, setProbeError] = useState('')
  const [probing, setProbing] = useState(false)
  useEffect(() => {
    setProbe(null); setProbeError('')
    if (!selected || !draft?.text || !selected.editable) { setProbing(false); return }
    setProbing(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api.fontProbe(document.id, selected.id, draft.text, draft.font, controller.signal)
        .then(result => { if (!controller.signal.aborted) setProbe(result) })
        .catch(error => { if (!controller.signal.aborted) setProbeError(messageOf(error)) })
        .finally(() => { if (!controller.signal.aborted) setProbing(false) })
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [document.id, selected?.id, selected?.editable, draft?.text, draft?.font, fonts])

  return <aside className={`inspector ${selected ? 'has-selection' : ''} ${expanded ? 'is-expanded' : 'is-collapsed'}`} aria-label="Text properties">
    <div className="panel-heading inspector-heading"><span className="desktop-inspector-title"><SlidersHorizontal size={16} />{selected ? 'Text properties' : 'Document overview'}</span><button className="mobile-properties-toggle" onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? 'Minimize text properties' : 'Show text properties'}><SlidersHorizontal size={17} /><span>Text properties{selected && <small>{selected.size.toFixed(1)} pt · {selected.font.replace(/^[A-Z]{6}\+/, '')}</small>}</span><ChevronDown size={17} /></button>{selected && <button className="icon-button tiny" onClick={onClose} title="Deselect text" aria-label="Deselect text"><X size={17} /></button>}</div>
    {selected && draft ? <>
      <div className="inspector-scroll">
        <div className="selection-summary"><span className="selection-kind"><span />{selected.source === 'native' ? 'Native text' : selected.source === 'ocr' ? 'Recognized text' : 'Replacement region'}</span><span>Page {selected.page + 1}</span></div>
        {!selected.editable && <div className="notice amber"><LockKeyhole size={17} /><span>{selected.reason}</span></div>}
        {selected.source !== 'native' && <div className="recovery-selection-note"><ScanText size={17} /><div><strong>{selected.source === 'ocr' ? `${Math.round(selected.confidence ?? 0)}% recognition confidence` : 'Reconstructed content'}</strong><p>Review the estimated font, text, and background.</p></div></div>}

        <section className="property-section"><label className="field-label" htmlFor="text-content">Content <span>{draft.text.length} characters</span></label><textarea id="text-content" aria-label="Text content" placeholder={selected.source === 'region' ? 'What would you like it to say?' : ''} value={draft.text} disabled={!selected.editable || applying} rows={3} spellCheck={false} maxLength={4000} onChange={e => onDraft({ ...draft, text: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onApply() } }} /><span className="field-helper">You can also type directly on the page.</span></section>

        <section className="property-section"><div className="field-label">Typography <button className="text-button" onClick={onFonts}>Browse fonts <ArrowUpRight size={13} /></button></div><label className="input-label" htmlFor="font-family">Font family</label><div className="select-wrap"><Type size={16} /><select id="font-family" value={draft.font} disabled={!selected.editable || applying} onChange={e => onDraft({ ...draft, font: e.target.value })}>
          <option value="auto">Auto · original font first</option><option value="original" disabled={selected.source !== 'native'}>Original · {selected.font.replace(/^[A-Z]{6}\+/, '')}</option>
          <optgroup label="Replacement fonts"><option value="helv">Helvetica</option><option value="hebo">Helvetica Bold</option><option value="heit">Helvetica Oblique</option><option value="tiro">Times Roman</option><option value="tibo">Times Bold</option><option value="cour">Courier</option></optgroup>
          <optgroup label="Font Studio">{fonts.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}{!['auto', 'original', 'helv', 'hebo', 'heit', 'tiro', 'tibo', 'cour'].includes(draft.font) && !fonts.some(font => font.id === draft.font) && <option value={draft.font}>{probe?.name ?? change?.font_name ?? 'Recovered library font'}</option>}</optgroup>
        </select><ChevronDown size={13} /></div>
        <div className="property-grid"><div><label className="input-label" htmlFor="font-size">Size</label><div className="number-field"><input id="font-size" aria-label="Font size" type="number" min="1" max="300" step="0.5" disabled={!selected.editable || applying} value={draft.size ?? Number(selected.size.toFixed(2))} onChange={e => onDraft({ ...draft, size: e.target.value === '' ? null : Number(e.target.value) })} /><span>pt</span></div></div><div><label className="input-label" htmlFor="text-color">Color</label><div className="color-field"><input id="text-color" aria-label="Text color" type="color" value={draft.color ?? selected.color} disabled={!selected.editable || applying} onChange={e => onDraft({ ...draft, color: e.target.value })} /><span>{(draft.color ?? selected.color).slice(1).toUpperCase()}</span></div></div></div>
        <div className={`font-status ${probeError || probe?.resolution.toLowerCase().includes('substitute') ? 'warning' : ''}`}>{probing ? <LoaderCircle size={14} className="spin" /> : probeError ? <AlertCircle size={15} /> : <CheckCheck size={15} />}<span>{probing ? 'Checking the font…' : probe ? `${probe.name} · ${probe.resolution}` : probeError ? 'Font needs attention' : 'No text to render'}</span></div>{probeError && <p className="font-probe-error">{probeError}</p>}
        {selected.source !== 'native' && <div className="recovery-background"><label className="input-label" htmlFor="region-background">Background · estimated</label><div className="color-field"><input id="region-background" aria-label="Replacement background" type="color" value={draft.background ?? selected.background ?? '#ffffff'} onChange={e => onDraft({ ...draft, background: e.target.value })} /><span>{(draft.background ?? selected.background ?? '#ffffff').toUpperCase()}</span></div></div>}
        </section>

        <section className="property-section"><div className="field-label">Layout</div><label className="switch-row"><span><strong>Fit to original width</strong><small>Gently reduce size if text needs room.</small></span><input type="checkbox" checked={draft.fit} disabled={!selected.editable || applying} onChange={e => onDraft({ ...draft, fit: e.target.checked })} /><span className="switch-track" /></label>{change && draft.fit && !dirty && <div className="field-helper">Output size: {change.size.toFixed(2)} pt</div>}<button className="selection-focus" onClick={onFocusSelection}><Focus size={16} /> Zoom to selection <ArrowUpRight size={14} /></button></section>
        <details className="font-details"><summary>Font & position details <ChevronDown size={14} /></summary><dl><div><dt>Source font</dt><dd>{selected.font}</dd></div><div><dt>Availability</dt><dd>{selected.font_status}{selected.subset ? ' · subset' : ''}</dd></div><div><dt>Baseline</dt><dd>{selected.origin[0].toFixed(1)}, {selected.origin[1].toFixed(1)} pt</dd></div><div><dt>Rotation</dt><dd>{selected.rotation ?? 0}°</dd></div></dl><p>Auto reuses the original font when possible. Substitutions are identified above; text-run structure is inferred.</p><button className="text-button" onClick={onFidelity}>Review edit fidelity <ArrowUpRight size={13} /></button></details>
      </div>
      {error && <div className="inspector-error notice error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
      <div className="inspector-actions"><button className="button primary apply-button" disabled={!dirty || !selected.editable || applying} onClick={onApply}>{applying ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{applying ? 'Checking & applying…' : 'Apply changes'}</button><div className="action-row"><button className="text-button" disabled={(!change && !dirty) || applying} onClick={onRestore}><RotateCcw size={14} /> Restore original</button><button className="icon-button danger" title="Clear selected text, then apply to delete" aria-label="Clear selected text" disabled={!selected.editable || applying || !draft.text} onClick={() => onDraft({ ...draft, text: '' })}><Trash2 size={17} /></button></div></div>
    </> : <div className="inspector-scroll">
      <div className="inspector-welcome"><span className="overview-art" aria-hidden="true"><span>Aa<i /></span><TextCursorInput size={24} /></span><h3>Make yourself<br />at home on the page.</h3><p>Click the text you want to change.<br />Its properties will appear here.</p><span className="overview-ready"><span /> {editableCount ? `${editableCount} text runs available` : 'Ready for text recovery'}</span></div>
      <div className="document-details"><div className="field-label">At a glance <FileText size={15} /></div><dl><div><dt>Pages</dt><dd>{document.page_count}</dd></div><div><dt>File size</dt><dd>{document.size < 1024 * 1024 ? `${(document.size / 1024).toFixed(1)} KB` : `${(document.size / 1024 / 1024).toFixed(1)} MB`}</dd></div><div><dt>Original fonts</dt><dd>{fontNames.length}</dd></div><div><dt>Applied edits</dt><dd>{editCount}</dd></div></dl></div>
      {document.warnings.map(warning => <div className="notice amber" key={warning}><AlertCircle size={16} /><span>{warning}</span></div>)}
      <div className="overview-links"><button onClick={onFonts}><span className="overview-link-icon lavender"><Type size={18} /></span><span>Explore document fonts<small>Inspect and recover original faces</small></span><ChevronRight size={15} /></button><button onClick={onOCR}><span className="overview-link-icon mint"><ScanText size={18} /></span><span>Working with a scan?<small>Recognize text on your device</small></span><ChevronRight size={15} /></button></div>
      <div className="preservation-note"><Fingerprint size={20} /><p>Your original file stays untouched. Export when you’re ready for an edited copy.</p></div>
    </div>}
  </aside>
}
