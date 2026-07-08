import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'

// The file extension picks the runtime: *.test.ts runs in Node (pure logic),
// *.test.tsx runs in a real browser (anything that touches the DOM). The only
// rule a contributor learns is "needs a DOM => name it .tsx".
//
// Two tests-only aliases: '@/' resolves a source module (src/), '#tests/'
// resolves a test helper (tests/). Both are defined only here and in
// tsconfig.test.json, so they resolve for the test runtime and the editor but
// not in production src, which imports relatively.
const alias = {
  // Normalize to forward slashes: backslash paths break vite-node's alias
  // resolution on Windows, so every unit-test file fails to load.
  '@/': fileURLToPath(new URL('./src/', import.meta.url)).replace(/\\/g, '/'),
  '#tests/': fileURLToPath(new URL('./tests/', import.meta.url)),
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          alias,
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          env: { TZ: 'UTC' },
          setupFiles: ['./tests/support/setup.ts'],
        },
      },
      {
        plugins: [react()],
        // Pre-bundle the heavy deps the components pull in so the optimizer
        // does not discover them mid-run and reload (which Vitest warns can
        // make browser tests flaky).
        optimizeDeps: {
          include: [
            'react-laag',
            'mantine-contextmenu',
            'mantine-datatable',
            '@glideapps/glide-data-grid',
          ],
        },
        test: {
          name: 'browser',
          alias,
          include: ['tests/**/*.test.tsx'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
    ],
  },
})
