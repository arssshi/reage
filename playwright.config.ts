import { defineConfig } from '@playwright/test'

const python = process.env.PYTHON ?? (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
const runningApp = process.env.REAGE_TEST_URL

export default defineConfig({
  testDir: './e2e',
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
    env: { PYTHON: python },
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
