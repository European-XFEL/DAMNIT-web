import { defineConfig, devices } from '@playwright/test'

import { baseConfig, isCI } from '@damnit-frontend/testing/playwright/base'

// A dedicated port keeps this server apart from a dev server on 5173. Projects
// are named by suite, so a browser variant such as integration-firefox fits.
const PORT = 6173
const APP_BASE_URL = `http://localhost:${PORT}/app/`

export default defineConfig({
  ...baseConfig,
  outputDir: 'test-results/integration',
  projects: [
    {
      name: 'integration-chromium',
      testDir: 'tests/integration',
      use: { ...devices['Desktop Chrome'], baseURL: APP_BASE_URL },
    },
  ],
  webServer: {
    // CI serves the production build (a preceding `Build app` step runs
    // `vite build`) to catch prod-only breakage and load faster; locally we use
    // the dev server for fast startup and HMR. Either way the browser intercepts
    // every request, so the app never reaches a real backend.
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
      // Consumed by the dev server; preview takes its port from --port above.
      VITE_PORT: String(PORT),
      // Lets the dev server render Glide Data Grid's a11y tree; main.tsx explains
      // why StrictMode blocks it. No-op for the production build CI serves.
      VITE_DISABLE_STRICT_MODE: 'true',
      // The browser intercepts every request, so the app never reaches these.
      // They exist only to satisfy vite.config: a valid VITE_API (it throws
      // without one) and the /app/ base that APP_BASE_URL expects.
      VITE_API: 'http://localhost',
      VITE_BASE_URL: '/app/',
      // Overrides a developer's .env.development.local, so a local run sends
      // no analytics, as in CI, and the off-site guard stays strict.
      VITE_UMAMI_ENABLED: 'false',
    },
  },
})
