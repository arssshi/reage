import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Copy, Italic, Minus, Move, Plus, SlidersHorizontal, Strikethrough, TextCursorInput, Trash2, Underline } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Change, TextEdit, TextSpan } from '../types'

interface Props {
  selected: TextSpan | null; draft: TextEdit | null; change?: Change; busy: boolean
  onChange: (patch: Partial<TextEdit>) => void; onFonts: () => void; onMove: () => void
  onDuplicate: () => void; onDelete: () => void; onProperties: () => void; moving: boolean
}

export default function FormattingBar({ selected, draft, change, busy, onChange, onFonts, onMove, onDuplicate, onDelete, onProperties, moving }: Props) {
  if (!selected || !draft) return <div className="formatting-bar formatting-empty"><TextCursorInput size={17} /><span>Select text to format it, or <strong>add your own.</strong></span><span className="formatting-tip"><kbd>T</kbd> Add text <span>·</span> <kbd>V</kbd> Move <span>·</span> <kbd>⌘ / Ctrl K</kbd> All tools</span></div>
  const size = draft.size ?? change?.size ?? selected.size
  const bold = draft.bold ?? change?.bold ?? selected.bold
  const italic = draft.italic ?? change?.italic ?? selected.italic
  const disabled = busy || !selected.editable
  const format = (property: 'bold' | 'italic' | 'underline' | 'strikeout', value: boolean) => onChange({ [property]: value })
  return <div className="formatting-bar" role="toolbar" aria-label="Text formatting">
    <button className="format-font" onClick={onFonts} disabled={disabled} title="Choose or recover a font"><span>{draft.font === 'auto' ? 'Auto · original font' : draft.font === 'original' ? selected.font.replace(/^[A-Z]{6}\+/, '') : change?.font_name || 'Selected font'}</span><ChevronDown size={13} /></button>
    <SizeControl key={selected.id} value={size} disabled={disabled} onChange={size => onChange({ size, fit: false })} />
    <span className="toolbar-divider" />
    {([{ name: 'Bold', icon: Bold, property: 'bold', active: bold, shortcut: 'Ctrl / ⌘ B' }, { name: 'Italic', icon: Italic, property: 'italic', active: italic, shortcut: 'Ctrl / ⌘ I' }, { name: 'Underline', icon: Underline, property: 'underline', active: !!draft.underline, shortcut: 'Ctrl / ⌘ U' }, { name: 'Strikethrough', icon: Strikethrough, property: 'strikeout', active: !!draft.strikeout, shortcut: '' }] as const).map(({ name, icon: Icon, property, active, shortcut }) => <button key={name} className={`icon-button format-toggle ${active ? 'active' : ''}`} disabled={disabled} aria-label={name} aria-pressed={active} title={`${name}${shortcut ? ` (${shortcut})` : ''}`} onClick={() => format(property, !active)}><Icon size={17} /></button>)}
    <label className="format-color" title="Text color"><span style={{ background: draft.color ?? selected.color }} /><input aria-label="Formatting color" type="color" value={draft.color ?? selected.color} disabled={disabled} onChange={event => onChange({ color: event.target.value })} /></label>
    <span className="toolbar-divider" />
    {([{ align: 'left', icon: AlignLeft }, { align: 'center', icon: AlignCenter }, { align: 'right', icon: AlignRight }] as const).map(({ align, icon: Icon }) => <button key={align} className={`icon-button format-toggle ${(draft.align ?? 'left') === align ? 'active' : ''}`} disabled={disabled} aria-label={`Align ${align}`} aria-pressed={(draft.align ?? 'left') === align} title={`Align ${align} within the original text width`} onClick={() => onChange({ align })}><Icon size={17} /></button>)}
    <span className="toolbar-divider" />
    <button className={`icon-button ${moving ? 'active' : ''}`} disabled={disabled} onClick={onMove} aria-label="Move selected text" title="Move text · drag the handle or use arrow keys" aria-pressed={moving}><Move size={17} /></button>
    <button className="icon-button" disabled={disabled || !draft.text} onClick={onDuplicate} aria-label="Duplicate text" title="Duplicate text (Ctrl / ⌘ D)"><Copy size={17} /></button>
    <button className="icon-button danger" disabled={disabled || !draft.text} onClick={onDelete} aria-label="Delete text" title="Delete selected text"><Trash2 size={17} /></button>
    <button className="format-properties" onClick={onProperties} title="Advanced text properties"><SlidersHorizontal size={16} /><span>Properties</span></button>
  </div>
}

function SizeControl({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (size: number) => void }) {
  const [input, setInput] = useState(String(Number(value.toFixed(1))))
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setInput(String(Number(value.toFixed(1)))) }, [value])
  function commit() {
    editing.current = false
    if (input.trim() && Number(input) !== value) onChange(Number(input))
    else setInput(String(Number(value.toFixed(1))))
  }
  function step(delta: number) {
    const size = Math.max(1, Math.min(300, (Number(input) || value) + delta))
    setInput(String(size)); onChange(size)
  }
  return <div className="format-size"><button className="icon-button tiny" aria-label="Decrease text size" disabled={disabled || value <= 1} onPointerDown={event => event.preventDefault()} onClick={() => step(-1)}><Minus size={13} /></button><input aria-label="Text size" type="number" min="1" max="300" step="1" value={input} disabled={disabled} onFocus={() => { editing.current = true }} onChange={event => setInput(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /><button className="icon-button tiny" aria-label="Increase text size" disabled={disabled || value >= 300} onPointerDown={event => event.preventDefault()} onClick={() => step(1)}><Plus size={13} /></button></div>
}
