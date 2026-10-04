import type { Box, Change, FontEntry, FontProbe, OCRLine, PdfDocument, TextEdit } from './types'
import { version as APP_VERSION } from '../package.json'
import { IS_HOSTED } from './config'
import { cloudRequest } from './cloud'

export { APP_VERSION }

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
  async inlineFont(id: string, span: string, font: string): Promise<ArrayBuffer> {
    return (await request(`/documents/${id}/inline-font/${span}?font=${encodeURIComponent(font)}`)).arrayBuffer()
  },
  async original(id: string): Promise<Blob> { return (await request(`/documents/${id}/original`)).blob() },
  async inlineStyle(id: string, span: string, font: string): Promise<{ name: string; ascent: number; web_font: boolean; subset: boolean }> {
    return (await request(`/documents/${id}/inline-style/${span}?font=${encodeURIComponent(font)}`)).json()
  },
  async fonts(refresh = false): Promise<{ fonts: FontEntry[]; google_families: string[] }> {
    return (await request(`/fonts?refresh=${refresh}`)).json()
  },
  async uploadFont(file: File): Promise<FontEntry> {
    const body = new FormData()
    body.append('file', file)
    return (await request('/fonts/upload', { method: 'POST', body })).json()
  },
  async fetchFont(family: string, weight: number, italic: boolean): Promise<FontEntry> {
    return (await request('/fonts/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ family, weight, italic }) })).json()
  },
  async fontProbe(id: string, span_id: string, text: string, font: string, signal?: AbortSignal): Promise<FontProbe> {
    return (await request(`/documents/${id}/font-probe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ span_id, text, font }), signal })).json()
  },
  async ocrLanguages(): Promise<{ languages: { code: string; name: string }[] }> {
    return (await request('/ocr/languages')).json()
  },
  async ocrModel(language: string, signal: AbortSignal): Promise<ArrayBuffer> {
    return (await request(`/ocr-data/${language}.traineddata`, { signal })).arrayBuffer()
  },
  async registerOCR(id: string, page: number, lines: OCRLine[], language: string, signal: AbortSignal): Promise<{ document: PdfDocument; recognized: number }> {
    return (await request(`/documents/${id}/pages/${page}/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines, language }), signal })).json()
  },
  async addRegion(id: string, page: number, bbox: Box): Promise<{ document: PdfDocument; span_id: string }> {
    return (await request(`/documents/${id}/pages/${page}/regions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox }) })).json()
  },
  async upload(file: File): Promise<PdfDocument> {
    const body = new FormData()
    body.append('file', file)
    return (await request('/documents', { method: 'POST', body })).json()
  },
  async demo(scanned = false): Promise<PdfDocument> {
    return (await request(scanned ? '/demo/scanned' : '/demo', { method: 'POST' })).json()
  },
  async close(id: string) {
    await request(`/documents/${id}`, { method: 'DELETE' })
  },
  async validate(id: string, edits: TextEdit[]): Promise<{ changes: Change[] }> {
    return (await request(`/documents/${id}/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits }),
    })).json()
  },
  async render(id: string, page: number, edits: TextEdit[], scale: number, signal: AbortSignal): Promise<Blob> {
    return (await request(`/documents/${id}/pages/${page}/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits, scale }), signal,
    })).blob()
  },
  async export(id: string, edits: TextEdit[]): Promise<Blob> {
    return (await request(`/documents/${id}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits }),
    })).blob()
  },
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
