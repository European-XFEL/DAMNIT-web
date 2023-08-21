import { ApolloClient, InMemoryCache, HttpLink, from } from "@apollo/client"
import {
  removeTypenameFromVariables,
  KEEP,
} from "@apollo/client/link/remove-typename"

const API =
  import.meta.env.MODE === "test" ? import.meta.env.VITE_BACKEND_API : ""

const httpLink = new HttpLink({ uri: `${API}/graphql` })

const removeTypenameLink = removeTypenameFromVariables({
  except: {
    JSON: KEEP,
  },
})

export const cache = new InMemoryCache({
  possibleTypes: {
    DamnitRun: ["p.*"],
  },
})

export const client = new ApolloClient({
  cache,
  link: from([removeTypenameLink, httpLink]),
})
