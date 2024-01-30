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
import { GraphQLWsLink } from "@apollo/client/link/subscriptions"
import { getMainDefinition } from "@apollo/client/utilities"

import { createClient } from "graphql-ws"

const BACKEND_API = import.meta.env.VITE_BACKEND_API

const HTTP_API = import.meta.env.MODE === "test" ? `http://${BACKEND_API}` : ""

const removeTypenameLink = removeTypenameFromVariables({
  except: {
    JSON: KEEP,
  },
})

const httpLink = new HttpLink({ uri: `${HTTP_API}/graphql` })

const wsLink = new GraphQLWsLink(
  createClient({
    url: `ws://${BACKEND_API}/graphql`,
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
  link: from([removeTypenameLink, splitLink]),
})
