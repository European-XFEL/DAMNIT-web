import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'

import { typePolicies } from '#src/graphql/type-policies'

// A client that answers every request with the table's metadata, over the
// app's own cache so a test can write the runs it reads straight into it.
export function metadataClient(metadata: object) {
  const link = new ApolloLink(
    () =>
      new Observable((observer) => {
        observer.next({ data: { metadata } })
        observer.complete()
      })
  )

  return new ApolloClient({ link, cache: new InMemoryCache({ typePolicies }) })
}
