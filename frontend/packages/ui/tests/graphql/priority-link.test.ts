import {
  ApolloLink,
  Observable,
  execute,
  gql,
  type FetchResult,
  type Observer,
} from '@apollo/client'
import { expect, test } from 'vitest'

import { DEFERRED_TABLE_DATA_QUERY_NAME } from '#src/graphql/operation-names'
import { createPriorityLink } from '#src/graphql/priority-link'

const DEFERRED = gql`
  query ${DEFERRED_TABLE_DATA_QUERY_NAME}($page: Int) {
    runs(page: $page)
  }
`

const PROMPT = gql`
  query TableMetaQuery {
    metadata
  }
`

// Records what reached the network and leaves every request hanging, handing
// back each one's observer so a test decides when (and whether) it answers.
function createNetwork() {
  const started: number[] = []
  const observers = new Map<number, Observer<FetchResult>>()
  let cancelled = 0

  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 0
    started.push(page)
    return new Observable<FetchResult>((observer) => {
      observers.set(page, observer)
      return () => {
        cancelled += 1
      }
    })
  })

  return { link, started, observers, cancelled: () => cancelled }
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

test('a queued operation waits for the whole answer, not the first payload', async () => {
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

  // An operation answering incrementally is still holding its request open
  // after its first payload, so letting the next one in would run both at once.
  network.observers.get(1)?.next?.({ data: { runs: [] } })
  expect(network.started).toEqual([1])

  network.observers.get(1)?.complete?.()
  expect(network.started).toEqual([1, 2])
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
