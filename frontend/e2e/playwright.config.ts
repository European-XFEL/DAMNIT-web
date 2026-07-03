import { defineConfig, devices } from '@playwright/test'

// A dedicated port keeps the e2e server independent of any dev server a
// developer may already run on 5173. Projects are named by surface, so a
// browser variant (app-firefox) or another surface (site) appends cleanly.
const PORT = 5190
const APP_BASE_URL = `http://localhost:${PORT}/app/`

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'app-chromium',
      testDir: 'tests/app',
      use: { ...devices['Desktop Chrome'], baseURL: APP_BASE_URL },
    },
  ],
  webServer: {
    command: 'pnpm --filter @damnit-frontend/app dev',
    url: APP_BASE_URL,
    // Always spawn a fresh server with the mock env below; never bind to a
    // server a developer happens to be running on this port with a different
    // config. If the port is busy, Playwright fails loudly instead.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_PORT: String(PORT),
      // The browser intercepts every request, so the app never reaches these.
      // They exist only to satisfy vite.config: a valid VITE_API (it throws
      // without one) and the /app/ base that APP_BASE_URL expects.
      VITE_API: 'http://localhost',
      VITE_BASE_URL: '/app/',
    },
  },
})
