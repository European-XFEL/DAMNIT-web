import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// The file extension picks the runtime: *.test.ts runs in Node (pure logic),
// *.test.tsx runs in a real browser (anything that touches the DOM). The only
// rule a contributor learns is "needs a DOM => name it .tsx".
//
// Tests reach source through '#src/' and helpers through '#tests/', the same
// package.json subpath imports production code uses. No aliases live here.

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
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
        // make browser tests flaky). Apollo is here for a second reason: left
        // unbundled its CommonJS interop hands the React namespace back as
        // null, and ApolloProvider dies on the first useContext.
        optimizeDeps: {
          include: [
            'react-laag',
            'mantine-contextmenu',
            'mantine-datatable',
            '@glideapps/glide-data-grid',
            '@apollo/client',
            '@apollo/client/react',
            '@apollo/client/utilities',
            '@apollo/client/link/retry',
            '@apollo/client/link/subscriptions',
            '@apollo/client/link/remove-typename',
            'graphql',
          ],
        },
        test: {
          name: 'browser',
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
