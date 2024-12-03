import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  HttpLink,
  Observable,
  from,
  split,
} from "@apollo/client"
import {
  removeTypenameFromVariables,
  KEEP,
} from "@apollo/client/link/remove-typename"
import { RetryLink } from "@apollo/client/link/retry"
import { GraphQLWsLink } from "@apollo/client/link/subscriptions"
import { getMainDefinition } from "@apollo/client/utilities"

import { createClient } from "graphql-ws"

import { BASE_URL } from "../constants"
import { DEFERRED_TABLE_DATA_QUERY_NAME } from "./queries"

const BACKEND_API = import.meta.env.VITE_BACKEND_API
const HTTP_API =
  import.meta.env.MODE === "test" ? `http://${BACKEND_API}${BASE_URL}` : "/"

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

const httpLink = new HttpLink({ uri: `${HTTP_API}graphql` })

const createPriorityLink = (maxActive = 3) => {
  const pendingQueue = []
  const activeQueue = new Set()

  const processNextOperation = () => {
    while (activeQueue.size < maxActive && pendingQueue.length > 0) {
      const nextOperation = pendingQueue.shift()
      activeQueue.add(nextOperation)

      nextOperation.execute().subscribe({
        next: (response) => {
          activeQueue.delete(nextOperation)
          nextOperation.observer.next(response)
          processNextOperation()
        },
        error: (error) => {
          activeQueue.delete(nextOperation)
          nextOperation.observer.error(error)
          processNextOperation()
        },
        complete: () => {
          activeQueue.delete(nextOperation)
          nextOperation.observer.complete()
        },
      })
    }
  }

  return new ApolloLink((operation, forward) => {
    const nonPriorityOperations = [DEFERRED_TABLE_DATA_QUERY_NAME]
    const operationName =
      operation.operationName || operation.query.definitions[0]?.name?.value

    return new Observable((observer) => {
      if (nonPriorityOperations.includes(operationName)) {
        pendingQueue.push({
          execute: () => forward(operation),
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

const wsProtocol = window.location.origin.startsWith("https") ? "wss" : "ws"
const wsUri = `${wsProtocol}://${window.location.host}/graphql`
const wsLink = new GraphQLWsLink(
  createClient({
    url: wsUri,
    shouldRetry: () => true,
  }),
)

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    )
  },
  wsLink,
  from([priorityLink, httpLink]),
)

export const cache = new InMemoryCache({
  possibleTypes: {
    DamnitRun: ["p.*"],
  },
})

export const client = new ApolloClient({
  cache,
  link: from([retryLink, removeTypenameLink, splitLink]),
})
