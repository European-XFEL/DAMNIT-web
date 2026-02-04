import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import '@damnit-frontend/ui/styles'
import { Providers, RootRoute, BASE_URL } from '@damnit-frontend/ui'
import App from './app'

const container = document.getElementById('root') as HTMLElement
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <Providers>
      <BrowserRouter basename={BASE_URL}>
        {/* TODO: Use react-router layout and define RootRoute as root component */}
        <RootRoute />
        <App />
      </BrowserRouter>
    </Providers>
  </React.StrictMode>
)
