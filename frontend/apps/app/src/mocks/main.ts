// Entry point for mock mode, swapped in for src/main.tsx by vite.config.ts.
//
// MSW has to start before the app is imported, because graphql-ws captures
// the global WebSocket when the Apollo client is created.
import { setupWorker } from 'msw/browser'

import { REST_API_PREFIXES } from '@damnit-frontend/shared/mocks'

import { handlers } from './handlers'

const BASE_URL = import.meta.env.BASE_URL

await setupWorker(...handlers).start({
  // Only warn about unmocked API requests, not assets.
  onUnhandledRequest(request, print) {
    const { pathname } = new URL(request.url)
    const isApiRequest = REST_API_PREFIXES.some((prefix) =>
      pathname.startsWith(`${BASE_URL}${prefix}`)
    )
    if (isApiRequest) {
      print.error()
    }
  },
  serviceWorker: { url: `${BASE_URL}mockServiceWorker.js` },
})

await import('../main')
