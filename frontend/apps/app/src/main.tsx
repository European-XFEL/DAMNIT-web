import React from 'react'
import { createRoot } from 'react-dom/client'

import '@damnit-frontend/ui/styles'
import { Providers } from '@damnit-frontend/ui'
import App from './app'

const container = document.getElementById('root') as HTMLElement
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
)
