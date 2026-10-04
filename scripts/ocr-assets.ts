import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
const files = new Map<string, string>([
  ['worker.min.js', resolve(dirname(require.resolve('tesseract.js/package.json')), 'dist/worker.min.js')],
  ['tesseract-core-lstm.wasm.js', resolve(dirname(require.resolve('tesseract.js-core/package.json')), 'tesseract-core-lstm.wasm.js')],
  ['tesseract-core-lstm.wasm', resolve(dirname(require.resolve('tesseract.js-core/package.json')), 'tesseract-core-lstm.wasm')],
  ['TESSERACT-LICENSE.txt', resolve(dirname(require.resolve('tesseract.js/package.json')), 'LICENSE.md')],
])

// Keep worker/WASM URLs stable and local in both Vite and the production build.
// No CDN requests are needed to execute OCR; language models use our local API.
export default function ocrAssets(): Plugin {
  return {
    name: 'reage-local-ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr-assets', (request, response, next) => {
        const name = request.url?.split('?')[0].replace(/^\//, '') ?? ''
        const path = files.get(name)
        if (!path) return next()
        response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'text/plain')
        response.end(readFileSync(path))
      })
    },
    generateBundle() {
      for (const [name, path] of files) {
        this.emitFile({ type: 'asset', fileName: `ocr-assets/${name}`, source: readFileSync(path) })
      }
    },
  }
}
