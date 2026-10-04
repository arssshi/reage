import { useEffect, useRef, useState } from 'react'
import { api, messageOf } from './api'
import type { Snapshot, TextEdit, TextSpan } from './types'

export const originalEdit = (span: TextSpan): TextEdit => ({ span_id: span.id, text: span.text, font: 'auto', size: null, color: null, fit: span.source !== 'native', background: null })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
interface State {
  history: Snapshot[]; cursor: number; selected: TextSpan | null; draft: TextEdit | null
  revision: number; automatic: boolean; composing: boolean; applying: boolean; error: string
}
const snapshotOf = (s: State) => s.history[s.cursor]
const dirtyOf = (s: State) => !!s.draft && !!s.selected && !same(s.draft, snapshotOf(s).edits.find(edit => edit.span_id === s.selected!.id) ?? originalEdit(s.selected))

/** A single writer owns validated snapshots. Inputs stay editable while the
 * server is busy; responses never replace a newer draft or an IME composition. */
export function useTextSession(documentId: string, notify: (message: string) => void) {
  const [state, setState] = useState<State>({ history: [{ edits: [], changes: [] }], cursor: 0, selected: null, draft: null, revision: 0, automatic: false, composing: false, applying: false, error: '' })
  const current = useRef(state)
  const pending = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true)
  const selectionRequest = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  function update(transform: (state: State) => State) {
    current.current = transform(current.current)
    if (mounted.current) setState(current.current)
  }
  function setDraft(draft: TextEdit | null, automatic = false) {
    update(s => ({ ...s, draft, automatic, revision: s.revision + 1, error: '' }))
  }
  function setError(error: string) { update(s => ({ ...s, error })) }
  function composition(composing: boolean) { update(s => ({ ...s, composing })) }

  async function commit(edits: TextEdit[], draft: TextEdit | null, quiet = false): Promise<boolean> {
    if (pending.current) return false
    const before = current.current
    update(s => ({ ...s, applying: true, error: '' }))
    const task = (async () => {
      try {
        const { changes } = await api.validate(documentId, edits)
        const pinned = edits.map(edit => {
          const change = changes.find(change => change.span_id === edit.span_id)
          return { ...edit, text: change?.text ?? edit.text, font: edit.font === 'auto' ? change?.font_id || 'original' : edit.font }
        })
        update(s => {
          const history = [...s.history.slice(0, s.cursor + 1), { edits: pinned, changes }].slice(-100)
          return { ...s, history, cursor: history.length - 1,
            draft: s.revision === before.revision && !s.composing ? (draft ? pinned.find(edit => edit.span_id === draft.span_id) ?? draft : null) : s.draft }
        })
        if (!quiet && mounted.current) notify('Changes applied. Preview matches your exported PDF.')
        return true
      } catch (error) {
        if (current.current.revision === before.revision) setError(messageOf(error))
        return false
      } finally {
        pending.current = null
        update(s => ({ ...s, applying: false }))
      }
    })()
    pending.current = task
    return task
  }

  async function applyDraft(): Promise<boolean> {
    if (pending.current) await pending.current
    const s = current.current
    if (s.composing) return false
    if (!s.draft || !s.selected || !dirtyOf(s)) return true
    const { draft, selected } = s
    if (draft.size !== null && (!Number.isFinite(draft.size) || draft.size < 1 || draft.size > 300)) {
      setError('Choose a font size between 1 and 300 points.'); return false
    }
    const edits = snapshotOf(s).edits.filter(edit => edit.span_id !== draft.span_id)
    const isOriginal = draft.text === selected.text && ['original', 'auto'].includes(draft.font) && (draft.size === null || draft.size === selected.size) && (draft.color === null || draft.color === selected.color) && !draft.background
    if (!isOriginal) edits.push(draft)
    return commit(edits, isOriginal ? originalEdit(selected) : draft, s.automatic)
  }

  // Finish all typing, including keystrokes arriving during validation. Export
  // and selection changes await this barrier rather than using a stale closure.
  async function flush(): Promise<boolean> {
    if (current.current.composing) return false
    if (pending.current) await pending.current
    while (dirtyOf(current.current)) {
      if (!await applyDraft()) return false
      if (current.current.composing) return false
    }
    return true
  }
  async function wait() { if (pending.current) await pending.current }
  async function settle(): Promise<boolean> {
    if (current.current.automatic) return flush()
    if (pending.current) await pending.current
    return !dirtyOf(current.current) || window.confirm('Discard the text changes you have not applied yet?')
  }
  async function select(selected: TextSpan | null): Promise<boolean> {
    const request = ++selectionRequest.current
    if (selected?.id === current.current.selected?.id) return true
    if (!await settle() || request !== selectionRequest.current || !mounted.current) return false
    update(s => ({ ...s, selected, draft: selected ? snapshotOf(s).edits.find(edit => edit.span_id === selected.id) ?? originalEdit(selected) : null, automatic: false, composing: false, error: '', revision: s.revision + 1 }))
    return true
  }
  async function moveHistory(delta: number) {
    if (!await settle()) return
    update(s => {
      const cursor = s.cursor + delta
      if (cursor < 0 || cursor >= s.history.length) return s
      return { ...s, cursor, automatic: false, error: '', revision: s.revision + 1,
        draft: s.selected ? s.history[cursor].edits.find(edit => edit.span_id === s.selected!.id) ?? originalEdit(s.selected) : null }
    })
  }
  async function restore() {
    if (pending.current) await pending.current
    const s = current.current
    if (!s.selected || s.composing) return
    const edits = snapshotOf(s).edits
    if (edits.some(edit => edit.span_id === s.selected!.id)) await commit(edits.filter(edit => edit.span_id !== s.selected!.id), originalEdit(s.selected))
    else setDraft(originalEdit(s.selected))
  }
  const applyRef = useRef(applyDraft)
  applyRef.current = applyDraft
  useEffect(() => {
    if (!state.automatic || state.composing || state.applying || state.error || !dirtyOf(state)) return
    const timer = window.setTimeout(() => void applyRef.current(), 500)
    return () => window.clearTimeout(timer)
  }, [state])
  return { ...state, snapshot: snapshotOf(state), dirty: dirtyOf(state), setDraft, setError, composition, commit, applyDraft, flush, wait, settle, select, moveHistory, restore,
    latest: () => ({ snapshot: snapshotOf(current.current), draft: current.current.draft, dirty: dirtyOf(current.current), automatic: current.current.automatic }) }
}
