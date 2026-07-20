import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  Observable,
  from,
  split,
  type NextLink,
  type Observer,
  type Operation,
  type FetchResult,
} from '@apollo/client'
import { onError } from '@apollo/client/link/error'
import {
  removeTypenameFromVariables,
  KEEP,
} from '@apollo/client/link/remove-typename'
import { RetryLink } from '@apollo/client/link/retry'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'

import { BASE_URL, WS_URL } from '#src/constants'
import { history } from '#src/lib/history'

import { DEFERRED_TABLE_DATA_QUERY_NAME } from './operation-names'

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
    max: 5,
    // Don't retry unauthenticated responses; surface them so `errorLink`
    // can redirect to login instead of hammering the API.
    retryIf: (error) => !!error && error.statusCode !== 401,
  },
})

// Redirect to the login route when the API reports the session is missing or
// invalid (401), e.g. an expired session mid-use. Route-level auth gating is
// handled separately by PrivateRoute (via /oauth/userinfo).
const errorLink = onError(({ networkError }) => {
  if (
    networkError &&
    'statusCode' in networkError &&
    networkError.statusCode === 401
  ) {
    history.navigate('/login')
  }
})

const httpLink = new HttpLink({ uri: `${BASE_URL}graphql` })

type PendingOperation = {
  execute: () => Observable<FetchResult>
  observer: Observer<FetchResult>
}

const createPriorityLink = (maxActive = 3) => {
  const pendingOperations: PendingOperation[] = []
  const activeOperations: Set<PendingOperation> = new Set()

  const processNextOperation = () => {
    while (activeOperations.size < maxActive && pendingOperations.length > 0) {
      const nextOperation = pendingOperations.shift()
      if (!nextOperation) {
        break
      }

      activeOperations.add(nextOperation)
      nextOperation.execute().subscribe({
        next: (response) => {
          activeOperations.delete(nextOperation)
          nextOperation.observer.next?.(response)
          processNextOperation()
        },
        error: (error) => {
          activeOperations.delete(nextOperation)
          nextOperation.observer.error?.(error)
          processNextOperation()
        },
        complete: () => {
          activeOperations.delete(nextOperation)
          nextOperation.observer.complete?.()
        },
      })
    }
  }

  return new ApolloLink((operation: Operation, forward: NextLink) => {
    const nonPriorityOperations = [DEFERRED_TABLE_DATA_QUERY_NAME]
    const definition = getMainDefinition(operation.query)
    const operationName =
      operation.operationName ||
      (definition.kind === 'OperationDefinition' && definition.name?.value) ||
      ''

    return new Observable((observer) => {
      if (nonPriorityOperations.includes(operationName)) {
        pendingOperations.push({
          execute: () => forward(operation) as Observable<FetchResult>,
          observer,
        })

        processNextOperation()
      } else {
        forward(operation).subscribe({
          next: (response) => {
            observer.next(response)
          },
          error: (error) => {
            observer.error(error)
          },
          complete: () => {
            observer.complete()
          },
        })
      }
    })
  })
}

const priorityLink = createPriorityLink(1)

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
  link: from([errorLink, retryLink, removeTypenameLink, splitLink]),
})
