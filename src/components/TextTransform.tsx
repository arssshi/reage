import { useRef, useState, type PointerEvent } from 'react'
import { Move } from 'lucide-react'
import type { Box, Change, PdfPage, TextEdit, TextSpan } from '../types'

interface Props {
  page: PdfPage; span: TextSpan; edit: TextEdit; change?: Change; changes: Change[]
  appliedEdit?: TextEdit
  scale: number; disabled: boolean; onTransform: (patch: Partial<TextEdit>) => void
  onGesture: (active: boolean) => void
}
interface Gesture { kind: 'move' | 'resize'; x: number; y: number; box: Box; patch: Partial<TextEdit>; pointer: number }

export default function TextTransform({ page, span, edit, appliedEdit, change, changes, scale, disabled, onTransform, onGesture }: Props) {
  const gesture = useRef<Gesture | null>(null)
  const [preview, setPreview] = useState<{ box: Box; guides: { x?: number; y?: number }; label: string } | null>(null)
  const box = change?.text === '' ? span.bbox : change?.bbox ?? span.bbox
  const size = change?.size ?? edit.size ?? span.size
  function start(event: PointerEvent<HTMLButtonElement>, kind: Gesture['kind']) {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onGesture(true)
    if (disabled) return
    gesture.current = { kind, x: event.clientX, y: event.clientY, box, patch: {}, pointer: event.pointerId }
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current
    if (!current || current.pointer !== event.pointerId) return
    event.stopPropagation()
    let dx = (event.clientX - current.x) / scale, dy = (event.clientY - current.y) / scale
    const [x0, y0, x1, y1] = current.box
    if (current.kind === 'resize') {
      const w = x1 - x0, h = y1 - y0
      const ratio = Math.max(.1, 1 + (dx * w + dy * h) / Math.max(1, w * w + h * h))
      const next = Math.max(1, Math.min(300, Math.round(size * ratio * 2) / 2))
      current.patch = { size: next, fit: false }
      const origin = change?.origin ?? span.origin
      setPreview({ box: [origin[0] + (x0 - origin[0]) * next / size, origin[1] + (y0 - origin[1]) * next / size, origin[0] + (x1 - origin[0]) * next / size, origin[1] + (y1 - origin[1]) * next / size], guides: {}, label: `${next} pt` })
      return
    }
    if (event.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
    dx = Math.max(-x0, Math.min(page.width - x1, dx)); dy = Math.max(-y0, Math.min(page.height - y1, dy))
    const guides: { x?: number; y?: number } = {}
    if (!event.altKey) {
      const changed = new Map(changes.map(item => [item.span_id, item]))
      const targetsX = [0, page.width / 2, page.width], targetsY = [0, page.height / 2, page.height]
      for (const other of page.spans) {
        if (other.id === span.id || !other.text && !changed.get(other.id)?.text) continue
        const b = changed.get(other.id)?.bbox ?? other.bbox
        targetsX.push(b[0], (b[0] + b[2]) / 2, b[2]); targetsY.push(b[1], (b[1] + b[3]) / 2, b[3])
      }
      const snap = (edges: number[], targets: number[]) => {
        let closest = 5 / scale, correction = 0, line: number | undefined
        for (const edge of edges) for (const target of targets) {
          const distance = Math.abs(target - edge)
          if (distance < closest) { closest = distance; correction = target - edge; line = target }
        }
        return { correction, line }
      }
      const x = snap([x0 + dx, (x0 + x1) / 2 + dx, x1 + dx], targetsX)
      const y = snap([y0 + dy, (y0 + y1) / 2 + dy, y1 + dy], targetsY)
      if (!event.shiftKey || Math.abs(dx) >= Math.abs(dy)) { dx += x.correction; guides.x = x.line }
      if (!event.shiftKey || Math.abs(dy) > Math.abs(dx)) { dy += y.correction; guides.y = y.line }
      dx = Math.max(-x0, Math.min(page.width - x1, dx)); dy = Math.max(-y0, Math.min(page.height - y1, dy))
    }
    // The handle belongs to the last valid PDF image. Failed draft offsets must
    // not be added again when the user drags to correct a collision.
    current.patch = { offset_x: Math.round(((appliedEdit?.offset_x ?? 0) + dx) * 100) / 100, offset_y: Math.round(((appliedEdit?.offset_y ?? 0) + dy) * 100) / 100 }
    setPreview({ box: [x0 + dx, y0 + dy, x1 + dx, y1 + dy], guides, label: `${dx >= 0 ? '+' : ''}${dx.toFixed(1)}, ${dy >= 0 ? '+' : ''}${dy.toFixed(1)} pt` })
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation()
    const current = gesture.current
    gesture.current = null; setPreview(null)
    onGesture(false)
    if (current && Object.keys(current.patch).length) onTransform(current.patch)
  }
  const b = preview?.box ?? box
  return <>
    {preview?.guides.x !== undefined && <div className="snap-guide vertical" style={{ left: preview.guides.x * scale }} />}
    {preview?.guides.y !== undefined && <div className="snap-guide horizontal" style={{ top: preview.guides.y * scale }} />}
    <div className={`text-transform ${preview ? 'is-transforming' : ''}`} style={{ left: b[0] * scale, top: b[1] * scale, width: Math.max(1, (b[2] - b[0]) * scale), height: Math.max(1, (b[3] - b[1]) * scale) }} onClick={event => event.stopPropagation()}>
      <button className="text-move-handle" aria-label="Drag to move text" title="Drag to move · Shift locks direction · Alt disables snapping" aria-disabled={disabled} onPointerDown={event => start(event, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current = null; setPreview(null); onGesture(false) }}><Move size={14} /><span>Move</span></button>
      <button className="text-resize-handle" aria-label="Drag to resize text" title="Drag to change text size" aria-disabled={disabled} onPointerDown={event => start(event, 'resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current = null; setPreview(null); onGesture(false) }} />
      {preview && <span className="transform-measurement">{preview.label}</span>}
    </div>
  </>
}
