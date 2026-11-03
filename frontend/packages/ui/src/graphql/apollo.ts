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

import { liveUpdatesListeners, retryNow, waitBeforeRetry } from './live-updates'
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
  attempts: {
    // An aborted request was cancelled on teardown, not lost. The default
    // retries on any error, which would fire five attempts at a dead signal.
    retryIf: (error) => error != null && error.name !== 'AbortError',
  },
})

const httpLink = new HttpLink({ uri: `${BASE_URL}graphql` })

// One deferred pass at a time: it pulls whole image columns against a single
// uvicorn worker, so two at once starve the page fetch the user is waiting on.
const priorityLink = createPriorityLink({
  maxActive: 1,
  queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
})

const wsClient = createClient({
  url: `${WS_URL}graphql`,
  shouldRetry: () => true,
  retryAttempts: Infinity,
  retryWait: waitBeforeRetry,
  connectionAckWaitTimeout: 20_000,
  keepAlive: 10_000,
  // Terminate, not close: a server that is gone never answers a close.
  on: liveUpdatesListeners(() => wsClient.terminate()),
})

// A new subscription skips the back-off left from an outage. End the wait
// after `subscribe`: subscribing can start it.
const wsLink = new GraphQLWsLink({
  ...wsClient,
  subscribe: (payload, sink) => {
    const unsubscribe = wsClient.subscribe(payload, sink)
    retryNow()
    return unsubscribe
  },
})

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    )
  },
  wsLink,
  // Only HTTP retries here: graphql-ws retries a dropped socket itself, and an
  // error the server sends, mostly a refusal, stops live updates until a reload.
  from([retryLink, priorityLink, httpLink])
)

// Apollo memoizes each read per (selection set, object), capped at 50,000
// entries by default. A cell costs two of those, the `Cell` and its
// `CellSummary`, so a table of a few hundred runs times its variables can fill
// the cap on its own. Past it every cache write re-reads the whole table instead
// of returning the memoized result, which is seconds of main thread per
// paginated page. The budget is shared across documents, and the summary plot
// asks for every run at once, so give it room. This is sized for a few thousand
// runs, not for `ALL_RUNS_PAGE_SIZE` of them.
//
// The one knob sets the cap for three caches: `executeSelectionSet` (the one
// reasoned about above), `executeSubSelectedArray` and `maybeBroadcastWatch`,
// whose own defaults are 10,000 and 5,000. Apollo offers no way to raise only
// one, so the other two are raised along with it; the price is that their
// entries now roll over far later, and a saturated budget costs tens of MB of
// bookkeeping. Leaving a proposal resets all three (`registerAppListeners`).
export const cache = new InMemoryCache({
  typePolicies,
  resultCacheMaxSize: 200_000,
})

export const client = new ApolloClient({
  cache,
  link: from([removeTypenameLink, splitLink]),
})
