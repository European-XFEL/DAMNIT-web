import type { PropsWithChildren, ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'

import type { AppStore } from '#src/app/store/store'

// The components under test only need Mantine's theme context. The Redux and
// Apollo providers arrive with the deferred data-layer test pass.
export function renderWithProviders(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

// A `renderHook` wrapper for hooks that only need the store.
export function withStore(store: AppStore) {
  return function ReduxWrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>
  }
}
