import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import '@damnit-frontend/ui/styles'
import { Providers } from '@damnit-frontend/ui'

import { worker } from './mocks/browser'
import { router } from './router'

worker
  .start({
    onUnhandledRequest: 'bypass',
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
