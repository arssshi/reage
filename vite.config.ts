import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ocrAssets from './scripts/ocr-assets'

const apiPort = Number(process.env.REAGE_API_PORT ?? '8000')
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error('REAGE_API_PORT must be a port between 1 and 65535.')
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), ocrAssets()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if ('writeHead' in response && !response.headersSent) {
              response.writeHead(503, { 'Content-Type': 'application/json' })
              response.end(JSON.stringify({
                code: 'pdf_service_unavailable',
                detail: `The Python PDF service is not reachable on port ${apiPort}. Stop this dev server and run npm run dev to start both services. Check that terminal for Python setup instructions.`,
              }))
            }
          })
        },
      },
    },
  },
})
