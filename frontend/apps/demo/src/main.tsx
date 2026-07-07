import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import '@damnit-frontend/ui/styles'
import { REST_API_PREFIXES } from '@damnit-frontend/shared/mocks'
import { Providers, BASE_URL } from '@damnit-frontend/ui'

import { worker } from './mocks/browser'
import { router } from './router'

worker
  .start({
    // Fail loudly on an unmocked REST call so mock drift surfaces immediately.
    // GraphQL drift is caught by the catch-all in handlers.ts; the demo's own
    // asset fetches (examples/*.json, vite modules) stay bypassed.
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
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>
    )
  })
