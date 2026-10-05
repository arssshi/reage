import { defineConfig } from '@playwright/test'

const python = process.env.PYTHON ?? (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
const runningApp = process.env.REAGE_TEST_URL
const hosted = process.env.REAGE_TEST_HOSTED === '1' || !!(runningApp && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(runningApp).hostname))

export default defineConfig({
  testDir: './e2e',
  testMatch: hosted ? ['**/hosted.spec.ts', '**/stability.spec.ts'] : '**/*.spec.ts',
  testIgnore: hosted ? undefined : '**/hosted.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: runningApp ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: runningApp ? undefined : {
    command: 'npm run dev -- --port 5173 --strictPort',
    env: { PYTHON: python, ...(hosted ? { REAGE_HOSTED: '1', VITE_REAGE_MODE: 'hosted' } : {}) },
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
