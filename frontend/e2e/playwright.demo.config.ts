import { defineConfig, devices } from '@playwright/test'

import { baseConfig } from './playwright.base'
import { WIDE_VIEWPORT } from './support/grid'

const PORT = 6175
const DEMO_BASE_URL = `http://localhost:${PORT}/demo/`

export default defineConfig({
  ...baseConfig,
  outputDir: 'test-results/demo',
  projects: [
    {
      name: 'demo-chromium',
      testDir: 'tests/demo',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DEMO_BASE_URL,
        viewport: WIDE_VIEWPORT,
      },
    },
  ],
  webServer: {
    // Builds on every run, so the suite never serves a stale bundle. Plain vite
    // build skips the app's tsc -b, which emits nothing and adds about 15s.
    command:
      'pnpm --filter @damnit-frontend/demo exec vite build && ' +
      `pnpm --filter @damnit-frontend/demo exec vite preview --base /demo/ --port ${PORT} --strictPort`,
    url: DEMO_BASE_URL,
    timeout: 300_000,
    env: {
      // As production passes it, with no trailing slash. Preview's --base
      // overrides it, so a build made for the wrong base 404s its assets.
      VITE_BASE_URL: '/demo',
    },
  },
})
