import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'

const alias = {
  // Normalize to forward slashes: backslash paths break vite-node's
  // alias resolution on Windows (imports fall through to Node's bare
  // package resolver and every test file fails to load).
  '@/': fileURLToPath(new URL('./src/', import.meta.url)).replace(/\\/g, '/'),
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          alias,
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'tests/**/*.browser.test.*'],
          environment: 'node',
          env: { TZ: 'UTC' },
          setupFiles: ['./tests/test-setup.ts'],
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
          include: ['tests/**/*.browser.test.{ts,tsx}'],
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
