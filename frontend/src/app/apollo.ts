import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
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
  httpLink,
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
