import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import '@damnit-frontend/ui/styles'
import { Providers, RootRoute, BASE_URL } from '@damnit-frontend/ui'
import App from './app'

const container = document.getElementById('root') as HTMLElement
const root = createRoot(container)

const tree = (
  <Providers>
    <BrowserRouter basename={BASE_URL}>
      {/* TODO: Use react-router layout and define RootRoute as root component */}
      <RootRoute />
      <App />
    </BrowserRouter>
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
