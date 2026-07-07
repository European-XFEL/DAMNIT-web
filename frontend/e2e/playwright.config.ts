import { defineConfig, devices } from '@playwright/test'

// A dedicated port keeps the e2e server independent of any dev server a
// developer may already run on 5173. Projects are named by surface, so a
// browser variant (app-firefox) or another surface (site) appends cleanly.
const PORT = 6173
const APP_BASE_URL = `http://localhost:${PORT}/app/`
const isCI = !!process.env.CI

export default defineConfig({
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
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
    // CI serves the production build (a preceding `Build app` step runs
    // `vite build`) to catch prod-only breakage and load faster; locally we
    // use the dev server for HMR. Either way the browser intercepts every
    // request, so the app never reaches a real backend.
    command: isCI
      ? `pnpm --filter @damnit-frontend/app exec vite preview --port ${PORT} --strictPort`
      : 'pnpm --filter @damnit-frontend/app dev',
    url: APP_BASE_URL,
    // Always spawn a fresh server on the dedicated port; never bind to a server
    // a developer happens to be running with a different config. If the port is
    // busy, Playwright fails loudly instead.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Consumed by the dev server. Preview takes its port from --port above
      // and bakes the base at build time. The browser intercepts every
      // request, so VITE_API is never reached; it only satisfies vite.config,
      // which throws without one.
      VITE_PORT: String(PORT),
      VITE_API: 'http://localhost',
      VITE_BASE_URL: '/app/',
    },
  },
})
