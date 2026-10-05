import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from '../api'
import type { TextEdit, TextSpan } from '../types'

interface Props {
  documentId: string
  span: TextSpan
  draft: TextEdit
  scale: number
  caret: number | null
  onChange: (text: string) => void
  onCommit: () => void
  onComposition: (value: boolean) => void
  onClose: () => void
  error: string
  active?: boolean
  pendingBackground?: boolean
  fittedSize?: number
}

export default function InlineTextEditor({ documentId, span, draft, scale, caret, onChange, onCommit, onComposition, onClose, error, active = true, pendingBackground = false, fittedSize }: Props) {
  const input = useRef<HTMLTextAreaElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  const composing = useRef(false)
  const [family, setFamily] = useState(/serif|times/i.test(span.font) && !/sans/i.test(span.font) ? '"Times New Roman", serif' : 'Arial, sans-serif')
  const [ascent, setAscent] = useState(.8)
  const [preview, setPreview] = useState('Loading original font…')
  const loaded = useRef<{ data: string | null | undefined; face: FontFace } | null>(null)
  const retired = useRef<FontFace[]>([])
  useLayoutEffect(() => {
    for (const face of retired.current) document.fonts.delete(face)
    retired.current = []
  }, [family])
  useEffect(() => () => {
    if (loaded.current) document.fonts.delete(loaded.current.face)
    for (const face of retired.current) document.fonts.delete(face)
  }, [])
  useEffect(() => {
    let active = true
    let face: FontFace | undefined
    const controller = new AbortController()
    api.inlineStyle(documentId, span.id, draft.font, controller.signal).then(async style => {
      if (!active) return
      setAscent(style.ascent)
      if (!style.web_font) { setPreview('Live draft · PDF font verified on apply'); return }
      if (style.font_data && loaded.current?.data === style.font_data) {
        setPreview(style.subset ? 'Embedded subset · missing glyphs checked on apply' : style.name)
        return
      }
      const name = `ReageInline${crypto.randomUUID().replaceAll('-', '')}`
      let buffer: ArrayBuffer
      if (style.font_data) {
        const raw = atob(style.font_data)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        buffer = bytes.buffer
      } else buffer = await api.inlineFont(documentId, span.id, draft.font)
      if (!active) return
      face = new FontFace(name, buffer, {
        ascentOverride: `${style.ascent * 100}%`, descentOverride: `${(1 - style.ascent) * 100}%`, lineGapOverride: '0%',
      })
      await face.load()
      if (!active) return
      document.fonts.add(face)
      if (loaded.current) retired.current.push(loaded.current.face)
      loaded.current = { data: style.font_data, face }
      setFamily(`"${name}", Arial, sans-serif`)
      setPreview(style.subset ? 'Embedded subset · missing glyphs checked on apply' : style.name)
    }).catch(() => { if (active) setPreview('Live draft · renderer checks the PDF font') })
    return () => { active = false; controller.abort() }
  }, [documentId, span.id, draft.font])
  useEffect(() => {
    if (!active) return
    input.current?.focus({ preventScroll: true })
    const index = Math.min(caret ?? draft.text.length, draft.text.length)
    input.current?.setSelectionRange(index, index)
  }, [span.id, caret, active])
  const angle = span.rotation || 0
  const width = (angle === 90 || angle === 270 ? span.bbox[3] - span.bbox[1] : span.bbox[2] - span.bbox[0]) * scale
  const size = (fittedSize ?? draft.size ?? span.size) * scale
  const height = Math.max(size * 1.15, (span.bbox[3] - span.bbox[1]) * scale)
  const horizontal = angle === 0
  useLayoutEffect(() => { setTextWidth(measure.current?.offsetWidth ?? 0) }, [draft.text, family, size])
  const textStyle: CSSProperties = { fontFamily: family, fontSize: size, lineHeight: '1', height: horizontal ? height : size * 1.15, width: Math.max(width + 4, Math.min(700, textWidth + 4), 30), color: draft.color ?? span.color, fontWeight: 'normal', fontStyle: 'normal', opacity: span.opacity }
  return <div className={`inline-edit ${error ? 'has-error' : ''} ${pendingBackground ? 'preparing-surface' : ''} ${active ? '' : 'settling-surface'}`} onClick={event => event.stopPropagation()} aria-hidden={!active || undefined}
    style={{ left: span.origin[0] * scale, top: span.origin[1] * scale - size * ascent, minWidth: Math.max(width, 30), transformOrigin: `0 ${size * ascent}px`, transform: angle ? `rotate(${-angle}deg)` : undefined }}>
    {active ? <textarea ref={input} aria-label="Edit text on page" spellCheck={false} rows={1} wrap="off" maxLength={4000} value={draft.text}
      style={textStyle}
      onChange={event => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
      onCompositionStart={() => { composing.current = true; onComposition(true) }}
      onCompositionEnd={() => { composing.current = false; onComposition(false) }}
      onBlur={() => { if (!composing.current) onCommit() }}
      onKeyDown={event => {
        if (composing.current || event.nativeEvent.isComposing) return
        if (event.key === 'Enter' || event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() }
      }} /> : <div className="inline-text-mirror" style={textStyle}>{draft.text}</div>}
    <span className="inline-measure-frame" aria-hidden="true"><span ref={measure} className="inline-measure" style={{ fontFamily: family, fontSize: size }}>{draft.text || ' '}</span></span>
    <div className="inline-caption">{active ? error || preview : 'Updating PDF preview…'}<span>{active ? 'Live draft · Enter to finish' : 'Keeping your text visible'}</span></div>
  </div>
}
