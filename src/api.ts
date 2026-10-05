import type { Box, Change, ExportOptions, FontEntry, FontMatches, FontProbe, OCRLine, PdfDocument, TextEdit } from './types'
import { version as APP_VERSION } from '../package.json'
import { IS_HOSTED } from './config'
import { cloudRequest } from './cloud'
import { RequestCache } from './requestCache'

export { APP_VERSION }

interface InlineStyle { name: string; ascent: number; web_font: boolean; subset: boolean; bold: boolean; italic: boolean; font_id?: string; font_data?: string | null }
const renders = new RequestCache<Blob>(32 * 1024 * 1024, blob => blob.size)
const inlineFonts = new RequestCache<InlineStyle>(12 * 1024 * 1024, style => (style.font_data?.length ?? 0) * 2 + 1024)
const revisions = new Map<string, number>()
let fontRevision = 0
const namespace = (id: string) => `${id}:${revisions.get(id) ?? -1}:${fontRevision}:`
function changedDocument(id: string) {
  revisions.set(id, (revisions.get(id) ?? 0) + 1)
  renders.clear(`${id}:`, false); inlineFonts.clear(`${id}:`, false)
}
function changedFonts() { fontRevision++; renders.clear('', false); inlineFonts.clear('', false) }

let verifiedUntil = 0
let checkingService: Promise<void> | null = null

async function checkService(force = false): Promise<void> {
  if (!force && Date.now() < verifiedUntil) return
  if (checkingService) return checkingService
  checkingService = (async () => {
    let response: Response
    try {
      response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(IS_HOSTED ? 30000 : 5000) })
    } catch {
      throw new Error(IS_HOSTED ? 'The PDF service is taking longer to respond. Check your connection and try again.' : 'The Python PDF service is unavailable. Stop the old Reage servers and run npm run dev from the project folder, then open the Local URL printed in that terminal.')
    }
    await checked(response)
    let body
    try { body = await response.json() } catch {
      throw new Error(IS_HOSTED ? 'The PDF service is temporarily unavailable. Please retry in a moment.' : 'This page is not connected to the Reage PDF service. Run npm run dev and open its Local URL, or build the app and launch python run.py.')
    }
    if (body.version !== APP_VERSION) {
      throw new Error(IS_HOSTED ? 'A new version of Reage is available. Export any open work before refreshing the page.' : `Service version mismatch: this interface is ${APP_VERSION}, but the running PDF service is ${body.version ?? 'unknown'}. Stop the old Python/Reage server and run npm run dev again, then reload this page. For the built app, restart python run.py.`)
    }
    if (body.status !== 'ok' || body.service !== 'reage') throw new Error('The connected PDF service is not ready. Please try again.')
    verifiedUntil = Date.now() + (IS_HOSTED ? 60000 : 5000)
  })()
  try { await checkingService } catch (error) { verifiedUntil = 0; throw error }
  finally { checkingService = null }
}

async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    let message = response.status === 413 ? 'This request is too large for the online workspace. Try a smaller PDF or run Reage locally.' : `The PDF service returned an error (${response.status}). Please try again.`
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail)
        ? body.detail.map((issue: { msg?: string; loc?: (string | number)[] }) => `${issue.loc?.slice(1).join('.') || 'Input'}: ${issue.msg || 'Invalid value'}`).join('; ')
        : message
    } catch { /* Keep the useful HTTP error when the response is not JSON. */ }
    throw new Error(message)
  }
  return response
}

async function request(path: string, options?: RequestInit) {
  try {
    await checkService()
    return await checked(await (IS_HOSTED ? cloudRequest(path, options) : fetch(`/api${path}`, options)))
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(IS_HOSTED ? 'The connection was interrupted. Your edits are still in this tab; check your connection and try again.' : 'Cannot reach the local Reage service. Run npm run dev to start the interface and Python PDF service together, then reopen the Local URL printed in that terminal.')
    }
    throw error
  }
}

export const api = {
  checkService,
  async inlineFont(id: string, span: string, font: string, bold?: boolean | null, italic?: boolean | null): Promise<ArrayBuffer> {
    const params = new URLSearchParams({ font })
    if (bold != null) params.set('bold', String(bold))
    if (italic != null) params.set('italic', String(italic))
    return (await request(`/documents/${id}/inline-font/${span}?${params}`)).arrayBuffer()
  },
  async original(id: string): Promise<Blob> { return (await request(`/documents/${id}/original`)).blob() },
  async inlineStyle(id: string, span: string, font: string, signal?: AbortSignal, bold?: boolean | null, italic?: boolean | null): Promise<InlineStyle> {
    const prefix = namespace(id)
    const styles = `${bold ?? ''}:${italic ?? ''}`
    const params = new URLSearchParams({ font, include_font: 'true' })
    if (bold != null) params.set('bold', String(bold))
    if (italic != null) params.set('italic', String(italic))
    const style = await inlineFonts.get(`${prefix}${span}:${font}:${styles}`, async control =>
      (await request(`/documents/${id}/inline-style/${span}?${params}`, { signal: control })).json(), signal)
    if (style.font_id && prefix === namespace(id)) inlineFonts.seed(`${prefix}${span}:${style.font_id}:${styles}`, style)
    return style
  },
  async fonts(refresh = false): Promise<{ fonts: FontEntry[]; google_families: string[] }> {
    return (await request(`/fonts?refresh=${refresh}`)).json()
  },
  async fontCatalog(): Promise<{ families: string[] }> { return (await request('/fonts/catalog')).json() },
  async fontMatches(id: string, span_id: string, text: string, signal?: AbortSignal): Promise<FontMatches> {
    return (await request(`/documents/${id}/font-matches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ span_id, text }), signal })).json()
  },
  async uploadFont(file: File): Promise<FontEntry> {
    const body = new FormData()
    body.append('file', file)
    const entry = await (await request('/fonts/upload', { method: 'POST', body })).json()
    changedFonts()
    return entry
  },
  async fetchFont(family: string, weight: number, italic: boolean): Promise<FontEntry> {
    const entry = await (await request('/fonts/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ family, weight, italic }) })).json()
    changedFonts()
    return entry
  },
  async fontProbe(id: string, span_id: string, text: string, font: string, signal?: AbortSignal, bold?: boolean | null, italic?: boolean | null): Promise<FontProbe> {
    return (await request(`/documents/${id}/font-probe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ span_id, text, font, bold, italic }), signal })).json()
  },
  async ocrLanguages(): Promise<{ languages: { code: string; name: string }[] }> {
    return (await request('/ocr/languages')).json()
  },
  async ocrModel(language: string, signal: AbortSignal): Promise<ArrayBuffer> {
    return (await request(`/ocr-data/${language}.traineddata`, { signal })).arrayBuffer()
  },
  async registerOCR(id: string, page: number, lines: OCRLine[], language: string, signal: AbortSignal): Promise<{ document: PdfDocument; recognized: number }> {
    const result = await (await request(`/documents/${id}/pages/${page}/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines, language }), signal })).json()
    changedDocument(id)
    return result
  },
  async addRegion(id: string, page: number, bbox: Box): Promise<{ document: PdfDocument; span_id: string }> {
    const result = await (await request(`/documents/${id}/pages/${page}/regions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox }) })).json()
    changedDocument(id)
    return result
  },
  async addText(id: string, page: number, bbox: Box, template?: string): Promise<{ document: PdfDocument; span_id: string }> {
    const result = await (await request(`/documents/${id}/pages/${page}/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox, template }) })).json()
    changedDocument(id)
    return result
  },
  async upload(file: File): Promise<PdfDocument> {
    const body = new FormData()
    body.append('file', file)
    const document = await (await request('/documents', { method: 'POST', body })).json()
    revisions.set(document.id, 0)
    return document
  },
  async demo(scanned = false): Promise<PdfDocument> {
    const document = await (await request(scanned ? '/demo/scanned' : '/demo', { method: 'POST' })).json()
    revisions.set(document.id, 0)
    return document
  },
  async close(id: string) {
    revisions.delete(id)
    renders.clear(`${id}:`); inlineFonts.clear(`${id}:`)
    if (IS_HOSTED) await cloudRequest(`/documents/${id}`, { method: 'DELETE' })
    else await request(`/documents/${id}`, { method: 'DELETE' })
  },
  async validate(id: string, edits: TextEdit[]): Promise<{ changes: Change[] }> {
    return (await request(`/documents/${id}/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits }),
    })).json()
  },
  async render(id: string, page: number, edits: TextEdit[], scale: number, signal: AbortSignal): Promise<Blob> {
    const body = JSON.stringify({ edits, scale })
    return renders.get(`${namespace(id)}${page}:${body}`, async control => (await request(`/documents/${id}/pages/${page}/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body, signal: control,
    })).blob(), signal)
  },
  async export(id: string, edits: TextEdit[], options: ExportOptions = {}): Promise<Blob> {
    return (await request(`/documents/${id}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...options, edits }),
    })).blob()
  },
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
