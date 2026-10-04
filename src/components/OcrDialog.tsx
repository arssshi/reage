import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Languages, LoaderCircle, ScanText, X } from 'lucide-react'
import type { Worker } from 'tesseract.js'
import { api, messageOf } from '../api'
import type { OCRLine, PdfDocument } from '../types'
import { IS_HOSTED } from '../config'

interface Props {
  document: PdfDocument
  page: number
  onUpdate: (document: PdfDocument) => void
  onClose: () => void
}

export default function OcrDialog({ document, page, onUpdate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const worker = useRef<Worker | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [languages, setLanguages] = useState([{ code: 'eng', name: 'English' }, { code: 'eng+hin', name: 'English + Hindi' }])
  const [language, setLanguage] = useState(document.pages.some(page => page.spans.some(span => /\p{Script=Devanagari}/u.test(span.text))) ? 'eng+hin' : 'eng')
  const [scope, setScope] = useState('page')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [recognized, setRecognized] = useState<number | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
    let active = true
    api.ocrLanguages().then(result => { if (active) setLanguages(result.languages) }).catch(error => { if (active) setError(messageOf(error)) })
    return () => { active = false; controller.current?.abort(); void worker.current?.terminate() }
  }, [])

  function close() {
    controller.current?.abort()
    void worker.current?.terminate()
    worker.current = null
    onClose()
  }

  async function recognize() {
    if (busy) return
    setBusy(true)
    setError('')
    setRecognized(null)
    const control = new AbortController()
    controller.current = control
    const pages = scope === 'page' ? [page] : document.pages.filter(page => page.needs_ocr).map(page => page.index)
    let count = 0
    try {
      setStatus('Preparing the open language model…')
      setProgress(0)
      // Prepare the server-side cache first so download failures are actionable
      // before starting a worker. Tesseract then reads that local cached asset.
      for (const code of language.split('+')) await api.ocrModel(code, control.signal)
      const { createWorker, OEM, PSM } = await import('tesseract.js')
      if (control.signal.aborted) return
      let rejectWorker: (reason: Error) => void = () => {}
      const workerError = new Promise<never>((_, reject) => { rejectWorker = reject })
      const abort = new Promise<never>((_, reject) => control.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
      const started = createWorker(language, OEM.LSTM_ONLY, {
        workerPath: `${window.location.origin}/ocr-assets/worker.min.js`,
        corePath: `${window.location.origin}/ocr-assets/tesseract-core-lstm.wasm.js`,
        langPath: `${window.location.origin}/api/ocr-data`,
        cacheMethod: IS_HOSTED ? 'write' : 'none',
        gzip: false,
        errorHandler: error => rejectWorker(new Error(String(error))),
        logger: event => {
          if (!control.signal.aborted && event.status === 'recognizing text') setProgress(Math.round(event.progress * 100))
        },
      })
      started.then(instance => { if (control.signal.aborted) void instance.terminate() }).catch(() => {})
      worker.current = await Promise.race([started, workerError, abort])
      await worker.current.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
      for (let index = 0; index < pages.length; index++) {
        if (control.signal.aborted) break
        const pageIndex = pages[index]
        setStatus(`Recognizing page ${pageIndex + 1} (${index + 1} of ${pages.length})…`)
        setProgress(0)
        // Recognition and the server's region estimates use the same immutable
        // source page. Applied native edits already have selectable text.
        const image = await api.render(document.id, pageIndex, [], 3, control.signal)
        const bitmap = await createImageBitmap(image)
        const xScale = document.pages[pageIndex].width / bitmap.width
        const yScale = document.pages[pageIndex].height / bitmap.height
        bitmap.close()
        const result = await Promise.race([worker.current.recognize(image, { rotateAuto: false }, { blocks: true, text: true }), workerError, abort])
        const lines: OCRLine[] = (result.data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines))
          .filter(line => line.text.trim() && line.confidence >= 15 && (line.bbox.x1 - line.bbox.x0) * xScale >= 2 && (line.bbox.y1 - line.bbox.y0) * yScale >= 2)
          .map(line => ({ text: line.text.trim(), confidence: line.confidence,
            bbox: [line.bbox.x0 * xScale, line.bbox.y0 * yScale, line.bbox.x1 * xScale, line.bbox.y1 * yScale],
            baseline: line.baseline ? (line.baseline.y0 + line.baseline.y1) * yScale / 2 : null }))
        setStatus(`Estimating fonts and preparing page ${pageIndex + 1}…`)
        const updated = await api.registerOCR(document.id, pageIndex, lines, language, control.signal)
        if (control.signal.aborted) break
        count += updated.recognized
        onUpdate(updated.document)
      }
      if (!control.signal.aborted) {
        setRecognized(count)
        setProgress(100)
        setStatus(count ? 'Text regions are ready. Review the recognized words and estimated fonts.' : 'No new text regions found. Try another language or use Replace region.')
      }
    } catch (error) {
      if (!control.signal.aborted) setError(messageOf(error))
    } finally {
      await worker.current?.terminate()
      worker.current = null
      if (!control.signal.aborted) setBusy(false)
    }
  }

  return <dialog className="recovery-dialog ocr-dialog" aria-label="Scan text (OCR)" ref={dialog} onCancel={event => { event.preventDefault(); close() }}>
    <div className="recovery-dialog-header"><div className="type-avatar"><ScanText size={24} /></div><div><h2>Turn pixels into editable words.</h2><p>Local OCR, powered by Tesseract.</p></div><button className="icon-button" onClick={close} aria-label="Close OCR"><X size={19} /></button></div>
    <div className="recovery-dialog-body">
      <div className="ocr-explanation"><ScanText size={26} /><p>For scans, outlined letters, and broken text layers. Reage recognizes the words, estimates their font and colors, and gives you selectable text regions.</p></div>
      <div className="ocr-options"><label><span><Languages size={15} /> Document language</span><select aria-label="OCR language" disabled={busy} value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(language => <option key={language.code} value={language.code}>{language.name}</option>)}</select></label><label><span>Pages to recognize</span><select aria-label="OCR pages" disabled={busy} value={scope} onChange={event => setScope(event.target.value)}><option value="page">Current page ({page + 1})</option><option value="needed" disabled={!document.pages.some(page => page.needs_ocr)}>All pages needing OCR</option></select></label></div>
      <div className="notice amber"><AlertCircle size={17} /><span>OCR and font matching are estimates. Replacements affect only the selected region; surrounding native text and images stay intact. A solid color covers the selected background, so review textured areas and recognition results before exporting.</span></div>
      <p className="recovery-help">Recognition runs in your browser. {IS_HOSTED ? 'Language models download from the public Tesseract repository. Page rendering and edit processing use our server.' : 'The first use downloads an open language model to your local service.'} Your PDF is not sent to an OCR provider.</p>
      {(busy || recognized !== null) && <div className="ocr-progress" role="status"><div>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}<span>{status}</span></div><progress max={100} value={progress} />{recognized !== null && <strong>{recognized} new editable text regions</strong>}</div>}
      {error && <div className="notice error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
    </div>
    <div className="recovery-dialog-footer"><button className="button secondary" onClick={close}>{busy ? 'Cancel' : 'Back to editor'}</button><button className="button primary" disabled={busy} onClick={() => void recognize()}>{busy ? <LoaderCircle className="spin" size={16} /> : <ScanText size={16} />}{busy ? 'Recognizing…' : 'Recognize text'}</button></div>
  </dialog>
}
