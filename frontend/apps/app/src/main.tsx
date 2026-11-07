import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import '@damnit-frontend/ui/styles'
import { Providers } from '@damnit-frontend/ui'

import { router } from './router'

const container = document.getElementById('root') as HTMLElement
const root = createRoot(container)

const tree = (
  <Providers>
    <RouterProvider router={router} />
  </Providers>
)

// StrictMode's dev-only double-mount trips a bug in Glide Data Grid's debounced
// accessibility tree, so the grid's <table role="grid"> never renders under the
// dev server. The e2e run sets VITE_DISABLE_STRICT_MODE=true (a no-op in the
// production build CI serves) so the tree renders and the grid stays testable.
const disableStrictMode =
  (import.meta.env.VITE_DISABLE_STRICT_MODE ?? '').toLowerCase() === 'true'

root.render(
  disableStrictMode ? tree : <React.StrictMode>{tree}</React.StrictMode>
)
