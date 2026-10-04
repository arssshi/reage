const mode = import.meta.env.VITE_REAGE_MODE
export const IS_HOSTED = mode ? mode === 'hosted' : !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
export const GITHUB_URL = 'https://github.com/arssshi/reage'
export const MAX_UPLOAD_MB = IS_HOSTED ? 3 : 30
export const PRIVACY_COPY = IS_HOSTED
  ? 'PDFs are sent to our server for each editing request, then discarded by the app. No saved documents or accounts. Run locally to keep files on your device.'
  : 'PDF processing stays on your machine. Original files are preserved. No account needed.'
