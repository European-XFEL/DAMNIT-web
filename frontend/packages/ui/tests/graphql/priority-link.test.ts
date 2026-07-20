import { ApolloLink, Observable, execute, gql } from '@apollo/client'
import { expect, test } from 'vitest'

import { DEFERRED_TABLE_DATA_QUERY_NAME } from '#src/graphql/operation-names'
import { createPriorityLink } from '#src/graphql/priority-link'

const DEFERRED = gql`
  query ${DEFERRED_TABLE_DATA_QUERY_NAME}($page: Int) {
    runs(page: $page)
  }
`

const PROMPT = gql`
  query TableMetadataQuery {
    metadata
  }
`

// Records what reached the network and leaves every request hanging, so a test
// decides when (and whether) each one answers.
function createNetwork() {
  const started: number[] = []
  let cancelled = 0

  const link = new ApolloLink((operation) => {
    started.push((operation.variables.page as number) ?? 0)
    return new Observable(() => () => {
      cancelled += 1
    })
  })

  return { link, started, cancelled: () => cancelled }
}

function send(link: ApolloLink, page: number) {
  return execute(link, { query: DEFERRED, variables: { page } }).subscribe(
    () => {}
  )
}

test('a queued operation waits for the one in flight', async () => {
  const network = createNetwork()
  const link = ApolloLink.from([
    createPriorityLink({
      maxActive: 1,
      queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
    }),
    network.link,
  ])

  send(link, 1)
  send(link, 2)

  expect(network.started).toEqual([1])
})

test('an operation nobody waits for stops holding up the queue', async () => {
  const network = createNetwork()
  const link = ApolloLink.from([
    createPriorityLink({
      maxActive: 1,
      queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
    }),
    network.link,
  ])

  const first = send(link, 1)
  send(link, 2)

  // The page that asked for this scrolled away. Its request is the only one in
  // flight, so leaving it running would stall every page behind it on an answer
  // with no reader.
  first.unsubscribe()

  expect(network.cancelled()).toBe(1)
  expect(network.started).toEqual([1, 2])
})

test('an operation cancelled before its turn never reaches the network', async () => {
  const network = createNetwork()
  const link = ApolloLink.from([
    createPriorityLink({
      maxActive: 1,
      queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
    }),
    network.link,
  ])

  send(link, 1)
  const second = send(link, 2)

  second.unsubscribe()

  expect(network.started).toEqual([1])
})

test('an operation that waits its turn does not block the rest', async () => {
  // Only the deferred pass queues; the queries the user is waiting on go
  // straight out, however many heavy pages are in flight.
  const network = createNetwork()
  const link = ApolloLink.from([
    createPriorityLink({
      maxActive: 1,
      queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
    }),
    network.link,
  ])

  send(link, 1)
  execute(link, { query: PROMPT }).subscribe(() => {})

  expect(network.started).toEqual([1, 0])
})
