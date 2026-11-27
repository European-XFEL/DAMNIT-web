import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  type ApolloCache,
} from '@apollo/client'

import { TABLE_META_QUERY } from '#src/data/table/table-data.queries'
import { typePolicies } from '#src/graphql/type-policies'

export function writeMetadata(
  cache: ApolloCache<unknown>,
  {
    proposal,
    ...metadata
  }: {
    proposal: string
    runs: object[]
    variables: object
    tags?: object
    groups?: object
  }
) {
  cache.writeQuery({
    query: TABLE_META_QUERY,
    variables: { proposal },
    data: { metadata: { tags: {}, groups: {}, ...metadata } },
  })
}

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
