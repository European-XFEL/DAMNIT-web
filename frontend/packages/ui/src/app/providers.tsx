import { type ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { ApolloProvider } from '@apollo/client/react'

import { client } from '#src/graphql/apollo'
import { setupStore } from '#src/app/store/store'
import { ThemeProvider } from '#src/app/theme-provider'

type ProvidersProps = {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ApolloProvider client={client}>
      <ReduxProvider store={setupStore()}>
        <ThemeProvider>{children}</ThemeProvider>
      </ReduxProvider>
    </ApolloProvider>
  )
}
