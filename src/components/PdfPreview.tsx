import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, RotateCw } from 'lucide-react'
import { api, messageOf } from '../api'
import type { Box, Change, PdfPage, TextEdit, TextSpan } from '../types'
import InlineTextEditor from './InlineTextEditor'

interface Props {
  documentId: string
  page: PdfPage
  edits: TextEdit[]
  changes?: Change[]
  scale: number
  thumbnail?: boolean
  selected?: string
  showBounds?: boolean
  interactive?: boolean
  onSelect?: (span: TextSpan, caret?: number) => void
  inlineDraft?: TextEdit | null
  inlineCaret?: number | null
  inlineError?: string
  onInlineChange?: (text: string) => void
  onInlineCommit?: () => void
  onComposition?: (value: boolean) => void
  onInlineClose?: () => void
  regionMode?: boolean
  onRegion?: (box: Box) => void
}

export default function PdfPreview({ documentId, page, edits, changes = [], scale, thumbnail = false, selected, showBounds, interactive, onSelect, regionMode, onRegion, inlineDraft, inlineCaret, inlineError = '', onInlineChange, onInlineCommit, onComposition, onInlineClose }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!thumbnail)
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [drawing, setDrawing] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  const point = (x: number, y: number): [number, number] => {
    const rect = container.current!.getBoundingClientRect()
    return [Math.max(0, Math.min(page.width, (x - rect.left) * page.width / rect.width)), Math.max(0, Math.min(page.height, (y - rect.top) * page.height / rect.height))]
  }
  const pageIds = useMemo(() => new Set(page.spans.map(s => s.id)), [page])
  const pageEdits = edits.filter(edit => pageIds.has(edit.span_id))
  // The input is a transient editing surface. Remove just the active PDF run
  // from its background using the real engine, preserving graphics underneath.
  if (interactive && inlineDraft && selected) {
    const index = pageEdits.findIndex(edit => edit.span_id === selected)
    if (index >= 0) pageEdits.splice(index, 1)
    pageEdits.push({ span_id: selected, text: '', font: 'auto', size: null, color: null, fit: false })
  }
  const serialized = JSON.stringify(pageEdits)
  const renderScale = thumbnail ? 0.3 : Math.min(6, Math.max(1, scale * Math.min(window.devicePixelRatio || 1, 2)))

  useEffect(() => {
    if (!thumbnail || visible || !container.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [thumbnail, visible])

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let url = ''
    setLoading(true)
    setError('')
    // Debounce zoom scrubbing and rapid history navigation.
    const timer = window.setTimeout(async () => {
      try {
        const blob = await api.render(documentId, page.index, JSON.parse(serialized), renderScale, controller.signal)
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setImage(url)
        setLoading(false)
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(messageOf(error))
          setLoading(false)
        }
      }
    }, thumbnail ? 120 : 60)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [documentId, page.index, serialized, renderScale, visible, thumbnail, retry])

  const changeMap = new Map(changes.map(change => [change.span_id, change]))
  return (
    <div ref={container} className={`pdf-page ${thumbnail ? 'thumbnail-page' : ''} ${loading ? 'rendering' : ''}`}
      style={{ width: page.width * scale, height: page.height * scale, cursor: regionMode ? 'crosshair' : undefined, touchAction: regionMode ? 'none' : undefined }} aria-busy={loading}
      onPointerDown={event => {
        if (!regionMode || thumbnail || loading || event.button !== 0) return
        event.preventDefault(); event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        const start = point(event.clientX, event.clientY)
        setDrawing({ start, end: start })
      }}
      onPointerMove={event => { if (drawing) setDrawing({ ...drawing, end: point(event.clientX, event.clientY) }) }}
      onPointerCancel={() => setDrawing(null)}
      onPointerUp={event => {
        if (!drawing) return
        event.stopPropagation()
        const end = point(event.clientX, event.clientY)
        const box: Box = [Math.min(drawing.start[0], end[0]), Math.min(drawing.start[1], end[1]), Math.max(drawing.start[0], end[0]), Math.max(drawing.start[1], end[1])]
        setDrawing(null)
        if (box[2] - box[0] >= 2 && box[3] - box[1] >= 2) onRegion?.(box)
      }}>
      {image && <img src={image} alt={thumbnail ? '' : `PDF page ${page.index + 1}`} draggable={false} />}
      {!image && !error && <div className="page-loading"><LoaderCircle size={thumbnail ? 18 : 28} className="spin" />{!thumbnail && <span>Rendering your page…</span>}</div>}
      {image && loading && !thumbnail && <div className="render-badge"><LoaderCircle size={12} className="spin" /> Updating preview</div>}
      {error && <div className="page-error"><AlertCircle size={22} />{!thumbnail && <><p>{error}</p><button className="button secondary small" onClick={() => setRetry(v => v + 1)}><RotateCw size={14} /> Try again</button></>}{thumbnail && <span>Preview unavailable</span>}</div>}
      {drawing && <div className="drawn-region" style={{ left: Math.min(drawing.start[0], drawing.end[0]) * scale, top: Math.min(drawing.start[1], drawing.end[1]) * scale, width: Math.abs(drawing.start[0] - drawing.end[0]) * scale, height: Math.abs(drawing.start[1] - drawing.end[1]) * scale }} />}
      {!thumbnail && !error && page.spans.map(span => {
        const change = changeMap.get(span.id)
         const bbox = change?.text === '' ? span.bbox : change?.bbox ?? span.bbox
         const text = change?.text ?? span.text
         // Fixed 4px expansion made dense 6pt lines overlap at fit-to-width,
         // so a neighboring line intercepted clicks in the benchmark PDF.
         const width = (bbox[2] - bbox[0]) * scale
         const height = (bbox[3] - bbox[1]) * scale
         const padding = Math.min(1.5, Math.min(width, height) * 0.06)
        return <button key={span.id} type="button"
          aria-label={`${span.editable ? 'Edit text' : 'Inspect text'}: ${text || '(deleted text)'}`}
          title={span.editable ? text || 'Deleted text — select to restore' : span.reason ?? 'View only'}
          tabIndex={interactive ? 0 : -1}
          className={`text-region ${showBounds || span.source !== 'native' ? 'show-bound' : ''} ${span.source !== 'native' ? 'recovered-region' : ''} ${selected === span.id ? 'selected' : ''} ${change ? 'modified' : ''} ${!span.editable ? 'view-only' : ''} ${!interactive ? 'no-interaction' : ''}`}
          style={{ left: bbox[0] * scale - padding, top: bbox[1] * scale - padding, width: Math.max(width + padding * 2, 1), height: Math.max(height + padding * 2, 1) }}
          onClick={event => {
            event.stopPropagation()
            const box = event.currentTarget.getBoundingClientRect()
            if (event.detail === 0) { onSelect?.(span, text.length); return }
            const angle = span.rotation || 0
            const fraction = angle === 90 ? (box.bottom - event.clientY) / box.height : angle === 270 ? (event.clientY - box.top) / box.height : angle === 180 ? (box.right - event.clientX) / box.width : (event.clientX - box.left) / box.width
            let caret = Math.round(Math.max(0, Math.min(1, fraction)) * text.length)
            // PDF character boxes, not equal-width guesses, determine the first
            // caret. Once active, the browser owns glyph-aware selection/IME.
            if (!change && span.glyphs?.length && span.glyphs.map(glyph => glyph.text).join('') === text) {
              const [x, y] = point(event.clientX, event.clientY)
              let offset = 0, best = Infinity
              for (const glyph of span.glyphs) {
                const vertical = angle === 90 || angle === 270
                const bounds = vertical ? [glyph.bbox[1], glyph.bbox[3]] : [glyph.bbox[0], glyph.bbox[2]]
                if (angle === 90 || angle === 180) bounds.reverse()
                for (const [index, bound] of bounds.entries()) {
                  const distance = Math.abs((vertical ? y : x) - bound)
                  if (distance < best) { best = distance; caret = offset + (index ? glyph.text.length : 0) }
                }
                offset += glyph.text.length
              }
            }
            onSelect?.(span, caret)
          }}>
          {selected === span.id && <><i className="selection-handle tl" /><i className="selection-handle tr" /><i className="selection-handle bl" /><i className="selection-handle br" /></>}
        </button>
      })}
      {!thumbnail && interactive && selected && inlineDraft && onInlineChange && page.spans.find(span => span.id === selected)?.editable && <InlineTextEditor key={selected} documentId={documentId} span={page.spans.find(span => span.id === selected)!} draft={inlineDraft} scale={scale} caret={inlineCaret ?? null} error={inlineError} onChange={onInlineChange} onCommit={() => onInlineCommit?.()} onComposition={value => onComposition?.(value)} onClose={() => onInlineClose?.()} />}
    </div>
  )
}
