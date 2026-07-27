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
import { typePolicies } from './type-policies'

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

// Apollo memoizes each read per (selection set, object), capped at 50,000
// entries by default. A cell costs two of those, the `Cell` and its
// `CellSummary`, so a table of a few hundred runs times its variables can fill
// the cap on its own. Past it every cache write re-reads the whole table instead
// of returning the memoized result, which is seconds of main thread per
// paginated page. The budget is shared across documents, and the summary plot
// asks for every run at once, so give it room.
//
// One knob, three caches: `resultCacheMaxSize` is the `max` for
// `executeSelectionSet` (the one reasoned about above), `executeSubSelectedArray`
// and `maybeBroadcastWatch`, whose own defaults are 10,000 and 5,000. Only the
// first is the binding constraint here, because it holds two entries per cell
// while the others hold roughly one per run, so raising all three is headroom
// the other two never reach rather than a budget worth splitting.
export const cache = new InMemoryCache({
  typePolicies,
  resultCacheMaxSize: 200_000,
})

export const client = new ApolloClient({
  cache,
  link: from([retryLink, removeTypenameLink, splitLink]),
})
