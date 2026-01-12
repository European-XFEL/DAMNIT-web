import { type ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { ApolloProvider } from '@apollo/client/react'
import { MantineProvider } from '@mantine/core'

import { client } from '../graphql/apollo'
import { setupStore } from '../redux/store'

type ProvidersProps = {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ApolloProvider client={client}>
      <ReduxProvider store={setupStore()}>
        <MantineProvider>{children}</MantineProvider>
      </ReduxProvider>
    </ApolloProvider>
  )
}
