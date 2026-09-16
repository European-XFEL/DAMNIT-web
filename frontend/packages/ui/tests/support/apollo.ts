import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'

// A client that answers every request with the table's metadata, for the
// toolbar popovers that read nothing else.
export function metadataClient(metadata: object) {
  const link = new ApolloLink(
    () =>
      new Observable((observer) => {
        observer.next({ data: { metadata } })
        observer.complete()
      })
  )

  return new ApolloClient({ link, cache: new InMemoryCache() })
}
