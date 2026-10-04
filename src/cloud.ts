import type { FontEntry } from './types'

interface Recovery { page: number; kind: 'ocr' | 'region'; payload: Record<string, unknown> }
interface Workspace { id: string; name: string; source: Blob; recovery: Recovery[] }
const documents = new Map<string, Workspace>()
const fonts = new Map<string, { file: Blob; entry: FontEntry }>()
const compositions: Record<string, string[]> = {}
const MAX_REQUEST = 4_000_000

/** Carry all required state with every request: cold starts and concurrent
 * serverless instances never need a previous request's memory or filesystem. */
export async function cloudRequest(path: string, options?: RequestInit): Promise<Response> {
  const url = new URL(path, 'https://reage.invalid')
  path = url.pathname
  if (path.startsWith('/ocr')) return fetch(`/api${path}`, options)
  if (path === '/demo' || path === '/demo/scanned') {
    const scanned = path.endsWith('/scanned')
    const response = await fetch(`/api/sample?scanned=${scanned}`)
    if (!response.ok) return response
    const body = new FormData()
    body.append('file', new File([await response.blob()], scanned ? 'Scanned — Not Stuck.pdf' : 'Common Ground — Field Notes.pdf', { type: 'application/pdf' }))
    return cloudRequest('/documents', { method: 'POST', body })
  }
  const id = path.match(/^\/documents\/([^/]+)/)?.[1]
  if (id && options?.method === 'DELETE') {
    documents.delete(id)
    if (!documents.size) { fonts.clear(); for (const key of Object.keys(compositions)) delete compositions[key] }
    return Response.json({ closed: true })
  }
  let workspace = id ? documents.get(id) : undefined
  const opening = path === '/documents'
  const input = options?.body instanceof FormData ? options.body.get('file') : null
  if (opening) {
    if (!(input instanceof File)) throw new Error('Choose a PDF file.')
    if (input.size > 3 * 1024 * 1024) throw new Error('The online editor accepts PDFs up to 3 MB. Run Reage locally for larger files.')
    workspace = { id: crypto.randomUUID(), name: input.name, source: input, recovery: [] }
  } else if (id && !workspace) {
    throw new Error('This browser workspace has closed. Please reopen your PDF.')
  }
  const payload: Record<string, unknown> = typeof options?.body === 'string' ? JSON.parse(options.body) : {}
  if (url.searchParams.has('font')) payload.font = url.searchParams.get('font')
  const operation = {
    path, id: workspace?.id ?? '', name: workspace?.name ?? 'Document.pdf', payload,
    recovery: workspace?.recovery ?? [], compositions,
  }
  const metadata = JSON.stringify(operation)
  const body = new FormData()
  body.append('operation', metadata)
  if (workspace) body.append('document', workspace.source, 'document.pdf')
  if (path === '/fonts/upload' && input instanceof File) body.append('file', input, 'font.otf')
  let size = new TextEncoder().encode(metadata).length + (workspace?.source.size ?? 0) + (path === '/fonts/upload' && input instanceof File ? input.size : 0)
  for (const { file } of fonts.values()) { body.append('fonts', file, 'font.otf'); size += file.size }
  if (size + 20_000 > MAX_REQUEST) throw new Error('This PDF and its fonts exceed the online workspace limit. Try a smaller document, or use the local app for larger files.')
  if (metadata.length > 500_000) throw new Error('This online workspace has too much recovery data. Export your PDF and reopen it to continue.')
  if (path.startsWith('/fonts/') && fonts.size >= 8) throw new Error('The online workspace supports eight added fonts. Export and close your document to start a fresh workspace.')
  const response = await fetch('/api/process', { method: 'POST', body, signal: options?.signal })
  if (!response.ok) return response
  const mixes = response.headers.get('X-Reage-Font-Compositions')
  if (mixes) Object.assign(compositions, JSON.parse(mixes))
  if (opening && workspace) documents.set(workspace.id, workspace)
  const mutation = path.match(/\/pages\/(\d+)\/(ocr|regions)$/)
  if (mutation && workspace) workspace.recovery.push({ page: Number(mutation[1]), kind: mutation[2] === 'ocr' ? 'ocr' : 'region', payload })
  if (path === '/fonts/upload' || path === '/fonts/fetch') {
    const result = await response.json()
    const bytes = Uint8Array.from(atob(result.data), char => char.charCodeAt(0))
    const file = new Blob([bytes], { type: 'font/otf' })
    const total = [...fonts.values()].reduce((sum, font) => sum + font.file.size, 0) + file.size
    if (total + Math.max(0, ...[...documents.values()].map(doc => doc.source.size)) + 100_000 > MAX_REQUEST) {
      throw new Error('That font is too large for this online document. Choose a smaller font or use the local app.')
    }
    const { data: _data, ...entry } = result
    fonts.set(entry.id, { file, entry })
    return Response.json(entry)
  }
  return response
}
