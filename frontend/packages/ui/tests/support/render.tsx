import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { render } from 'vitest-browser-react'

// The components under test only need Mantine's theme context. The Redux and
// Apollo providers arrive with the deferred data-layer test pass.
export function renderWithProviders(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}
