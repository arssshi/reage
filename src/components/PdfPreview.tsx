import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

interface Surface { span: TextSpan; draft: TextEdit; caret: number | null }
interface Frame { url: string; key: string; hidden: string | null; changes: Change[] }

export default function PdfPreview({ documentId, page, edits, changes = [], scale, thumbnail = false, selected, showBounds, interactive, onSelect, regionMode, onRegion, inlineDraft, inlineCaret, inlineError = '', onInlineChange, onInlineCommit, onComposition, onInlineClose }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!thumbnail)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const image = frame?.url ?? ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [drawing, setDrawing] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  const point = (x: number, y: number): [number, number] => {
    const rect = container.current!.getBoundingClientRect()
    return [Math.max(0, Math.min(page.width, (x - rect.left) * page.width / rect.width)), Math.max(0, Math.min(page.height, (y - rect.top) * page.height / rect.height))]
  }
  const pageIds = useMemo(() => new Set(page.spans.map(s => s.id)), [page])
  const activeSpan = interactive && inlineDraft?.span_id === selected ? page.spans.find(span => span.id === selected && span.editable) : undefined
  const activeSurface: Surface | null = activeSpan && inlineDraft ? { span: activeSpan, draft: inlineDraft, caret: inlineCaret ?? null } : null
  const pageEdits = edits.filter(edit => pageIds.has(edit.span_id))
  // The input is a transient editing surface. Remove just the active PDF run
  // from its background using the real engine, preserving graphics underneath.
  if (activeSurface) {
    const index = pageEdits.findIndex(edit => edit.span_id === activeSurface.span.id)
    if (index >= 0) pageEdits.splice(index, 1)
    pageEdits.push({ span_id: activeSurface.span.id, text: '', font: 'auto', size: null, color: null, fit: false })
  }
  const serialized = JSON.stringify(pageEdits)
  const renderScale = thumbnail ? 0.3 : Math.min(6, Math.max(1, scale * Math.min(window.devicePixelRatio || 1, 2)))
  const renderKey = `${documentId}:${page.index}:${renderScale}:${serialized}`
  const hiddenSpan = activeSurface?.span.id ?? null
  const renderChanges = useRef(changes)
  renderChanges.current = changes
  const previousScale = useRef(renderScale)

  // Keep the last draft visible until a fully decoded replacement frame takes
  // over. During fast A → B → C selection changes, more than one handoff can
  // be outstanding; none may expose the text-less intermediate PDF image.
  useLayoutEffect(() => {
    setSurfaces(previous => {
      const next = (frame?.key === renderKey ? [] : previous).filter(surface => surface.span.id !== activeSpan?.id)
      if (activeSpan && inlineDraft) next.push({ span: activeSpan, draft: inlineDraft, caret: inlineCaret ?? null })
      return next.length === previous.length && next.every((surface, i) => surface.span === previous[i].span && surface.draft === previous[i].draft && surface.caret === previous[i].caret) ? previous : next
    })
  }, [activeSpan, inlineDraft, inlineCaret, frame?.key, renderKey])
  const displayedSurfaces = (frame?.key === renderKey ? [] : surfaces).filter(surface => surface.span.id !== activeSpan?.id)
  if (activeSurface) displayedSurfaces.push(activeSurface)

  // A displayed object URL belongs to its frame, not the fetch that produced
  // it. Revoking it when a newer request starts can blank a still-visible page.
  useEffect(() => () => { if (frame) URL.revokeObjectURL(frame.url) }, [frame])

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
    setLoading(true)
    setError('')
    const delay = thumbnail ? 120 : previousScale.current === renderScale ? 0 : 60
    previousScale.current = renderScale
    // Zoom scrubbing is debounced; selection and cached history paint promptly.
    const timer = window.setTimeout(async () => {
      let url = ''
      let published = false
      try {
        const blob = await api.render(documentId, page.index, JSON.parse(serialized), renderScale, controller.signal)
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        const decoded = new Image()
        decoded.src = url
        await decoded.decode()
        if (controller.signal.aborted) return
        setFrame({ url, key: renderKey, hidden: hiddenSpan, changes: renderChanges.current })
        published = true
        setLoading(false)
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(messageOf(error))
          setLoading(false)
        }
      } finally {
        if (url && !published) URL.revokeObjectURL(url)
      }
    }, delay)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
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
      {!thumbnail && displayedSurfaces.map(surface => {
        const active = surface.span.id === activeSpan?.id
        const verified = changes.find(change => change.span_id === surface.span.id && change.text === surface.draft.text)
        const pendingBackground = frame?.hidden !== surface.span.id
        const painted = frame?.changes.find(change => change.span_id === surface.span.id)?.bbox ?? surface.span.bbox
        const box = surface.span.bbox
        const left = Math.min(box[0], painted[0]), top = Math.min(box[1], painted[1])
        const right = Math.max(box[2], painted[2]), bottom = Math.max(box[3], painted[3])
        return <div key={surface.span.id} className="inline-surface-layer">
          {pendingBackground && <div className="inline-source-cover" aria-hidden="true" style={{ left: left * scale - 2, top: top * scale - 2, width: (right - left) * scale + 4, height: (bottom - top) * scale + 4 }} />}
          <InlineTextEditor documentId={documentId} span={surface.span} draft={surface.draft} fittedSize={surface.draft.fit ? verified?.size : undefined} scale={scale} caret={surface.caret} active={active} pendingBackground={pendingBackground} error={active ? inlineError : ''} onChange={text => { if (active) onInlineChange?.(text) }} onCommit={() => { if (active) onInlineCommit?.() }} onComposition={value => { if (active) onComposition?.(value) }} onClose={() => { if (active) onInlineClose?.() }} />
        </div>
      })}
    </div>
  )
}
