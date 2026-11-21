import { defineConfig, devices } from '@playwright/test'

import { baseConfig } from './playwright.base'

const PORT = 6174
const SITE_BASE_URL = `http://localhost:${PORT}/`

export default defineConfig({
  ...baseConfig,
  outputDir: 'test-results/site',
  projects: [
    {
      name: 'site-chromium',
      testDir: 'tests/site',
      use: { ...devices['Desktop Chrome'], baseURL: SITE_BASE_URL },
    },
  ],
  webServer: {
    // Builds on every run, so the suite never serves a stale bundle. Plain vite
    // build skips the app's tsc -b, which emits nothing and adds about 15s.
    command:
      'pnpm --filter @damnit-frontend/site exec vite build && ' +
      `pnpm --filter @damnit-frontend/site exec vite preview --port ${PORT} --strictPort`,
    url: SITE_BASE_URL,
    timeout: 300_000,
    env: {
      // Shaped as production passes them: absolute, beside the site, and with
      // no trailing slash.
      VITE_APP_URL: `${SITE_BASE_URL}app`,
      VITE_DEMO_URL: `${SITE_BASE_URL}demo`,
    },
  },
})
