import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the real stack: Vite dev server + API + Postgres
 * (`docker compose up -d` first) on testnet. Uses the installed Google Chrome.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm start -w @buchki/api',
      cwd: '../..',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: true,
      timeout: 60_000
    },
    {
      command: 'npm run dev -w @buchki/web',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000
    }
  ]
})
