import type { PropsWithChildren, ReactNode } from 'react'
import type { ApolloClient } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'

import type { AppStore } from '#src/app/store/store'
import { ThemeProvider } from '#src/app/theme-provider'

// For components that only need Mantine's theme context. As a `wrapper`, the
// theme stays around whatever a `rerender` passes.
export function renderWithProviders(ui: ReactNode) {
  return render(ui, { wrapper: ThemeProvider })
}

// A `renderHook` wrapper for hooks that only need the store.
export function withStore(store: AppStore) {
  return function ReduxWrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>
  }
}

type WithProvidersOptions = {
  store: AppStore
  client: ApolloClient<object>
}

// A `render` or `renderHook` wrapper for code that reads the store and Apollo.
// Each test builds its own client, since what the link answers is the setup.
export function withProviders({ store, client }: WithProvidersOptions) {
  return function Providers({ children }: PropsWithChildren) {
    return (
      <Provider store={store}>
        <ApolloProvider client={client}>
          <ThemeProvider>{children}</ThemeProvider>
        </ApolloProvider>
      </Provider>
    )
  }
}
