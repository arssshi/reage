export type Box = [number, number, number, number]
export type WorkspaceTool = 'edit' | 'ocr' | 'fonts' | 'replace'

export interface TextSpan {
  id: string
  page: number
  text: string
  bbox: Box
  origin: [number, number]
  font: string
  size: number
  color: string
  opacity: number
  bold: boolean
  italic: boolean
  font_status: 'embedded' | 'standard' | 'unavailable' | 'repaired' | 'estimated'
  editable: boolean
  reason: string | null
  source: 'native' | 'ocr' | 'region'
  confidence: number | null
  background: string | null
  suggested_font: string | null
  rotation?: number
  estimated_font?: string
  subset?: boolean
  glyphs?: { text: string; bbox: Box }[]
  anchor?: { page: number; block: number; line: number; run: number; font_xref: number | null; structure: 'inferred' }
}

export interface PdfPage {
  index: number
  width: number
  height: number
  rotation: number
  spans: TextSpan[]
  needs_ocr: boolean
  ocr_applied: boolean
  text_kind: 'text' | 'image' | 'no-text' | 'recovered'
}

export interface PdfDocument {
  id: string
  name: string
  page_count: number
  size: number
  pages: PdfPage[]
  warnings: string[]
  revision: number
}

export type FontChoice = string

export interface FontEntry {
  id: string
  name: string
  family: string
  style: string
  source: string
  weight: number
  italic: boolean
}

export interface FontProbe {
  id: string
  name: string
  resolution: string
  source: string
  original_name: string
  suggested_download: string | null
}

export interface OCRLine {
  text: string
  bbox: Box
  baseline: number | null
  confidence: number
}

export interface TextEdit {
  span_id: string
  text: string
  font: FontChoice
  size: number | null
  color: string | null
  fit: boolean
  background?: string | null
}

export interface Change {
  span_id: string
  bbox: Box
  size: number
  text: string
  color: string
  font_name: string
  font_resolution: string
  font_id: string
}

export interface Snapshot {
  edits: TextEdit[]
  changes: Change[]
}
