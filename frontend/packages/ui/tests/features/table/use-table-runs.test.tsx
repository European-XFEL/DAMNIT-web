import { type PropsWithChildren } from 'react'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { renderHook } from 'vitest-browser-react'
import { afterEach, expect, test, vi } from 'vitest'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  TABLE_DATA_QUERY_NAME,
} from '#src/graphql/operation-names'
import { liveRunStamps, stampLiveRuns } from '#src/data/table/run-stamps'
import { TABLE_DATA_QUERY } from '#src/data/table/table-data.queries'
import { createPriorityLink } from '#src/graphql/priority-link'
import { typePolicies } from '#src/graphql/type-policies'
import { useTableRuns } from '#src/features/table/use-table-runs'

const PROPOSAL = '900405'
const PAGE_SIZE = 10
const LIGHTWEIGHT_NAME = `Lightweight${TABLE_DATA_QUERY_NAME}`

// The stamp store is module state shared across tests: reset it so one test's
// push cannot flash a later test's runs.
afterEach(() => {
  liveRunStamps(new Map())
})

// A run whose only cell is a heavy value @lightweight held back, so the hook
// always has a deferred pass to fire for the page.
const runFor = (run: number) => ({
  __typename: 'DamnitRun',
  database: PROPOSAL,
  proposal: PROPOSAL,
  run,
  cells: [
    {
      __typename: 'Cell',
      name: 'spectrum',
      value: null,
      dtype: 'array',
      error: null,
    },
  ],
})

// Answers the lightweight page reads at once and leaves every deferred read
// hanging, recording which pages started and which were cancelled, so a test
// decides when (and whether) a page's heavy values land.
function createNetwork() {
  const started = { lightweight: [] as number[], deferred: [] as number[] }
  const cancelled = { deferred: [] as number[] }

  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      started.lightweight.push(page)
      return new Observable((observer) => {
        observer.next({ data: { runs: [runFor(page)] } })
        observer.complete()
      })
    }
    started.deferred.push(page)
    return new Observable(() => () => {
      cancelled.deferred.push(page)
    })
  })

  return { link, started, cancelled }
}

async function renderTableRuns(network: { link: ApolloLink }) {
  const client = new ApolloClient({
    cache: new InMemoryCache({ typePolicies }),
    link: ApolloLink.from([
      createPriorityLink({
        maxActive: 1,
        queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
      }),
      network.link,
    ]),
  })

  function Providers({ children }: PropsWithChildren) {
    return <ApolloProvider client={client}>{children}</ApolloProvider>
  }

  const view = await renderHook(
    () =>
      useTableRuns({
        proposal: PROPOSAL,
        paginated: true,
        pageSize: PAGE_SIZE,
      }),
    { wrapper: Providers }
  )
  return { ...view, client }
}

test('a scroll sweep fetches the window it settles on, not every window it crossed', async () => {
  const pages: number[] = []
  const link = new ApolloLink((operation) => {
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      const page = (operation.variables.page as number) ?? 1
      pages.push(page)
      return new Observable((observer) => {
        observer.next({ data: { runs: [runFor(page)] } })
        observer.complete()
      })
    }
    return new Observable(() => () => {})
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(pages).toContain(1))
  pages.length = 0

  // Dragging the scrollbar: the grid reports a region on every frame, and each
  // one names a different band of pages.
  for (let y = 0; y < 500; y += 10) {
    result.current.onVisibleRegionChanged({ x: 0, y, width: 100, height: 20 })
  }

  await vi.waitFor(() => expect(pages.length).toBeGreaterThan(0))
  // Fetching per frame would ask for every page the drag passed over, and none
  // of those requests can be cancelled once made.
  expect(pages.length).toBeLessThan(10)
})

test('cancels in-flight deferred fetches when the hook unmounts', async () => {
  const network = createNetwork()
  const { unmount } = await renderTableRuns(network)

  await vi.waitFor(() => expect(network.started.deferred).toContain(1))

  // A proposal switch remounts the hook. Its in-flight heavy pages must let go,
  // or they land after the teardown eviction and write the departed proposal's
  // runs back into the cache.
  await unmount()

  await vi.waitFor(() => expect(network.cancelled.deferred).toEqual([1]))
})

test('does not flash a run filled by a cache write', async () => {
  const network = createNetwork()
  const { result, client } = await renderTableRuns(network)
  const key = `${PROPOSAL}:1`

  await vi.waitFor(() =>
    expect(result.current.cellsByKey.get(key)).toBeDefined()
  )

  // Fill run 1's held-back cell straight through the cache, the way the
  // deferred pass (or any bulk load) lands. A fill is not an update.
  client.cache.writeQuery({
    query: TABLE_DATA_QUERY,
    variables: {
      proposal: PROPOSAL,
      page: 1,
      per_page: PAGE_SIZE,
      names: ['run', 'spectrum'],
    },
    data: {
      runs: [
        {
          __typename: 'DamnitRun',
          database: PROPOSAL,
          proposal: PROPOSAL,
          run: 1,
          cells: [
            {
              __typename: 'Cell',
              name: 'spectrum',
              value: [1, 2, 3],
              dtype: 'array',
              error: null,
            },
          ],
        },
      ],
    },
  })

  // The fill landed, and the run still carries no flash stamp.
  await vi.waitFor(() =>
    expect(result.current.cellsByKey.get(key)?.spectrum.value).toEqual([
      1, 2, 3,
    ])
  )
  expect(result.current.lastUpdatedByKey.get(key)).toBeUndefined()
})

test('flashes a pushed run in the grid frame clock', async () => {
  const network = createNetwork()
  const { result } = await renderTableRuns(network)
  const key = `${PROPOSAL}:1`

  // Stamp the way the subscription push handler does when a push arrives.
  stampLiveRuns([{ proposal: PROPOSAL, run: 1 }])

  // Glide fades the flash against its own performance.now() frame time, so
  // the stamp must sit in that clock: an epoch stamp (Date.now()) reads as
  // decades in the future and paints the row yellow forever.
  await vi.waitFor(() =>
    expect(result.current.lastUpdatedByKey.get(key)).toBeGreaterThan(0)
  )
  expect(result.current.lastUpdatedByKey.get(key)).toBeLessThanOrEqual(
    performance.now()
  )
})
