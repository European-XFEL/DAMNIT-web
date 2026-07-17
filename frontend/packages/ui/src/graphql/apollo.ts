import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  split,
} from '@apollo/client'
import {
  removeTypenameFromVariables,
  KEEP,
} from '@apollo/client/link/remove-typename'
import { RetryLink } from '@apollo/client/link/retry'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'

import { BASE_URL, WS_URL } from '#src/constants'

import { DEFERRED_TABLE_DATA_QUERY_NAME } from './operation-names'
import { createPriorityLink } from './priority-link'

const removeTypenameLink = removeTypenameFromVariables({
  except: {
    JSON: KEEP,
  },
})

const retryLink = new RetryLink({
  delay: {
    initial: 1000,
    max: 1000,
  },
})

const httpLink = new HttpLink({ uri: `${BASE_URL}graphql` })

// The deferred pass fetches a page's heavy values, so letting several run at
// once would hold up the lighter queries the user is actually waiting to see.
const priorityLink = createPriorityLink({
  maxActive: 1,
  queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
})

const wsLink = new GraphQLWsLink(
  createClient({
    url: `${WS_URL}graphql`,
    shouldRetry: () => true,
  })
)

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    )
  },
  wsLink,
  from([priorityLink, httpLink])
)

export const cache = new InMemoryCache()

export const client = new ApolloClient({
  cache,
  link: from([retryLink, removeTypenameLink, splitLink]),
})
