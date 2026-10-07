const mode = import.meta.env.VITE_REAGE_MODE
export const BASE_URL = import.meta.env.BASE_URL || '/'
const pagesHost = typeof window !== 'undefined' && window.location.hostname === 'arssshi.github.io'
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? (pagesHost ? 'https://reage0.vercel.app' : '')).replace(/\/$/, '')
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://arssshi.github.io/reage').replace(/\/$/, '')
export const IS_HOSTED = mode ? mode === 'hosted' : !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
export const GITHUB_URL = 'https://github.com/arssshi/reage'
export const MAX_UPLOAD_MB = IS_HOSTED ? 3 : 30
export const PRIVACY_COPY = IS_HOSTED
  ? 'PDFs are sent to our server for each editing request, then discarded by the app. No saved documents or accounts. Run locally to keep files on your device.'
  : 'PDF processing stays on your machine. Original files are preserved. No account needed.'

export function assetUrl(path: string) {
  return `${BASE_URL}${path.replace(/^\/+/, '')}`
}

export function apiUrl(path: string) {
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}
