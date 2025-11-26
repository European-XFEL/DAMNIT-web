import { type ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { BrowserRouter } from 'react-router'
import { ApolloProvider } from '@apollo/client/react'
import { MantineProvider } from '@mantine/core'

import { client } from '../graphql/apollo'
import { BASE_URL } from '../constants'
import { setupStore } from '../redux/store'

type ProvidersProps = {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ApolloProvider client={client}>
      <ReduxProvider store={setupStore()}>
        <BrowserRouter basename={BASE_URL}>
          <MantineProvider>{children}</MantineProvider>
        </BrowserRouter>
      </ReduxProvider>
    </ApolloProvider>
  )
}
