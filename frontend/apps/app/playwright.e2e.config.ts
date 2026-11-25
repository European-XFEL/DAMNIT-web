import { defineConfig, devices } from '@playwright/test'

import { baseConfig } from '@damnit-frontend/testing/playwright/base'
import { WIDE_VIEWPORT } from '@damnit-frontend/testing/playwright/grid'

import { DAMNIT_DIR, MOCK_PROPOSAL } from './tests/e2e/support/real-api'

const APP_PORT = 6176
const API_PORT = 6177
const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}/app/`
const API_URL = `http://127.0.0.1:${API_PORT}`

const use = {
  ...devices['Desktop Chrome'],
  baseURL: APP_BASE_URL,
  viewport: WIDE_VIEWPORT,
}

export default defineConfig({
  ...baseConfig,
  // More workers starve the one API and preview server, and the canvas specs
  // time out. Two is what a CI runner gets.
  workers: 2,
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  projects: [
    {
      name: 'e2e-app-chromium',
      testIgnore: 'live-updates.spec.ts',
      use,
    },
    {
      // Last, so the run it adds changes no other spec's table.
      name: 'e2e-app-live-chromium',
      testMatch: 'live-updates.spec.ts',
      dependencies: ['e2e-app-chromium'],
      // One at a time, so two repeats never add the same next run.
      workers: 1,
      use,
    },
  ],
  webServer: [
    {
      // Playwright runs this only when nothing answers the url, so listing tests
      // or a second run never replaces the copy a running suite serves.
      command:
        `rm -rf '${DAMNIT_DIR}' && cp -r '${MOCK_PROPOSAL}' '${DAMNIT_DIR}' && ` +
        `uv run --no-sync python -m damnit_api.main --path '${DAMNIT_DIR}'`,
      url: `${API_URL}/docs`,
      timeout: 120_000,
      env: {
        DW_API_UVICORN__PORT: String(API_PORT),
        DW_API_UVICORN__RELOAD: 'false',
      },
    },
    {
      // Builds on every run, as the site and demo suites do. vite preview takes
      // the dev server's proxy table and its `host: true`, so --host keeps the
      // unauthenticated API off the network.
      command:
        'pnpm --filter @damnit-frontend/app exec vite build && ' +
        `pnpm --filter @damnit-frontend/app exec vite preview --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
      url: APP_BASE_URL,
      timeout: 300_000,
      // Set in full here, so they beat a developer's own env files.
      env: {
        VITE_API: API_URL,
        VITE_BASE_URL: '/app/',
        VITE_UMAMI_ENABLED: 'false',
        VITE_DISABLE_STRICT_MODE: 'true',
        VITE_MTLS_CA: '',
        VITE_MTLS_CERT: '',
        VITE_MTLS_KEY: '',
      },
    },
  ],
})
