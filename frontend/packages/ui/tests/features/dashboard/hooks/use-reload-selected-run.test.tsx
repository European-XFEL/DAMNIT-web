import type { PropsWithChildren } from 'react'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  from,
  type FetchResult,
} from '@apollo/client'
import { removeTypenameFromVariables } from '@apollo/client/link/remove-typename'
import { ApolloProvider } from '@apollo/client/react'
import { renderHook } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'

import {
  RUN_FRAGMENT,
  TABLE_DATA_QUERY,
} from '#src/data/table/table-data.queries'
import { cellsByName } from '#src/data/table/table-data.transforms'
import type { Run, RunId } from '#src/data/table/table-data.types'
import { useReloadSelectedRun } from '#src/features/dashboard/hooks/use-reload-selected-run'
import { countReconnect } from '#src/graphql/live-updates'
import { typePolicies } from '#src/graphql/type-policies'
import { serverCell } from '#tests/support/cells'

const PROPOSAL = '900405'

// A run as the table's metadata hands it out, `__typename` included.
const selectedRunFor = (run: number) => ({
  __typename: 'RunId',
  proposal: PROPOSAL,
  run,
})

const runFor = (run: number, values: Record<string, number>) => ({
  __typename: 'DamnitRun',
  database: PROPOSAL,
  proposal: PROPOSAL,
  run,
  cells: Object.entries(values).map(([name, value]) =>
    serverCell({ database: PROPOSAL, proposal: PROPOSAL, run, name, value })
  ),
})

type Request = {
  operationName: string
  variables: Record<string, unknown>
}

// Answers each request with the runs it names as they stand when it arrives,
// after that request's delay, and records what each one asked for.
function createServer(
  runs: ReturnType<typeof runFor>[],
  { delays = [] }: { delays?: number[] } = {}
) {
  const server = {
    runs,
    requests: [] as Request[],
    answered: 0,
    link: new ApolloLink(({ operationName, variables }) => {
      const delay = delays[server.requests.length] ?? 0
      server.requests.push({ operationName, variables })
      const ids = variables.ids as RunId[]
      const answer = server.runs.filter((run) =>
        ids.some((id) => id.run === run.run)
      )

      return new Observable<FetchResult>((observer) => {
        const timer = setTimeout(() => {
          observer.next({ data: { runs: answer } })
          observer.complete()
          server.answered += 1
        }, delay)
        return () => clearTimeout(timer)
      })
    }),
  }

  return server
}

const requestedRuns = (requests: Request[]) =>
  requests.flatMap(({ variables }) =>
    (variables.ids as RunId[]).map((id) => id.run)
  )

const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

async function renderReload(
  link: ApolloLink,
  {
    run,
    cache = new InMemoryCache({ typePolicies }),
  }: {
    run: RunId | undefined
    // Pre-seeded when a test starts from a run the table already loaded.
    cache?: InMemoryCache
  }
) {
  // The app's client strips `__typename` from variables the same way.
  const client = new ApolloClient({
    cache,
    link: from([removeTypenameFromVariables(), link]),
  })

  function Providers({ children }: PropsWithChildren) {
    return <ApolloProvider client={client}>{children}</ApolloProvider>
  }

  return renderHook(
    (props) => useReloadSelectedRun({ proposal: PROPOSAL, run: props!.run }),
    { wrapper: Providers, initialProps: { run } }
  )
}

// A cache that already holds the run, as when the table loaded it.
function cacheWith(
  run: ReturnType<typeof runFor>,
  options: { resultCacheMaxSize?: number } = {}
) {
  const cache = new InMemoryCache({ typePolicies, ...options })
  cache.writeFragment({ fragment: RUN_FRAGMENT, data: run })

  return cache
}

// What the run panel shows for one variable: it reads the run with this fragment.
function panelValue(
  cache: InMemoryCache,
  { run, name }: { run: number; name: string }
) {
  const entry = cache.readFragment<Run>({
    fragment: RUN_FRAGMENT,
    id: cache.identify({
      __typename: 'DamnitRun',
      database: PROPOSAL,
      proposal: PROPOSAL,
      run,
    }),
  })

  return cellsByName(entry?.cells ?? []).get(name)?.summary.value
}

// Writes a run into the cache the way the live push handler does.
function pushRun(cache: InMemoryCache, run: ReturnType<typeof runFor>) {
  cache.writeQuery({
    query: TABLE_DATA_QUERY,
    variables: { proposal: PROPOSAL },
    data: { runs: [run] },
  })
}

test('a reconnect asks for the selected run by proposal and run number, with every cell', async () => {
  const server = createServer([runFor(5, { n_trains: 1200 })])
  await renderReload(server.link, { run: selectedRunFor(5) })

  countReconnect()

  await vi.waitFor(() => expect(server.requests).toHaveLength(1))
  // No `names`, so the server sends every cell the run has.
  expect(server.requests[0]).toEqual({
    operationName: 'SelectedRunQuery',
    variables: { proposal: PROPOSAL, ids: [{ proposal: PROPOSAL, run: 5 }] },
  })
})

test('a value changed during an outage reaches the run panel after a reconnect', async () => {
  const cache = cacheWith(runFor(5, { n_trains: 1200 }))
  const server = createServer([runFor(5, { n_trains: 1300 })])
  await renderReload(server.link, { run: selectedRunFor(5), cache })

  countReconnect()

  await vi.waitFor(() =>
    expect(panelValue(cache, { run: 5, name: 'n_trains' })).toBe(1300)
  )
})

test('a value changed during an outage reaches the run panel when the cache is too full to keep its reads', async () => {
  // A cap this small stands in for a proposal too large for the app's read
  // cache: each read builds the run's cells anew.
  const cache = cacheWith(runFor(5, { n_trains: 1200 }), {
    resultCacheMaxSize: 1,
  })
  const server = createServer([runFor(5, { n_trains: 1300 })])
  await renderReload(server.link, { run: selectedRunFor(5), cache })

  countReconnect()

  await vi.waitFor(() =>
    expect(panelValue(cache, { run: 5, name: 'n_trains' })).toBe(1300)
  )
})

test('a reconnect during an earlier reload leaves the run panel on the newer value', async () => {
  const cache = cacheWith(runFor(5, { n_trains: 1100 }))
  // The first answer lands while the second request is still out.
  const server = createServer([runFor(5, { n_trains: 1200 })], {
    delays: [300, 600],
  })
  await renderReload(server.link, { run: selectedRunFor(5), cache })

  // Live updates reconnect
  countReconnect()
  await vi.waitFor(() => expect(server.requests).toHaveLength(1))

  // Run 5 changes, and live updates drop and reconnect before the first answer
  server.runs = [runFor(5, { n_trains: 1300 })]
  countReconnect()
  await vi.waitFor(() => expect(server.requests).toHaveLength(2))

  await vi.waitFor(() => expect(server.answered).toBe(2))
  await settle()
  expect(panelValue(cache, { run: 5, name: 'n_trains' })).toBe(1300)
})

test('a value pushed while the reload is out stays, and the reload brings the rest', async () => {
  const cache = cacheWith(runFor(5, { n_trains: 1200, sample: 10 }))
  // The server reads run 5 after `sample` changed during the outage, and its
  // answer is slow.
  const server = createServer([runFor(5, { n_trains: 1200, sample: 20 })], {
    delays: [300],
  })
  await renderReload(server.link, { run: selectedRunFor(5), cache })

  // Live updates reconnect
  countReconnect()
  await vi.waitFor(() => expect(server.requests).toHaveLength(1))

  // A push for run 5 lands before the answer
  pushRun(cache, runFor(5, { n_trains: 1300 }))

  await vi.waitFor(() => expect(server.answered).toBe(1))
  await settle()
  expect(panelValue(cache, { run: 5, name: 'n_trains' })).toBe(1300)
  expect(panelValue(cache, { run: 5, name: 'sample' })).toBe(20)
})

test('an older value written back while the reload is out gives way to its answer', async () => {
  const cache = cacheWith(runFor(5, { n_trains: 1200 }))
  const server = createServer([runFor(5, { n_trains: 1300 })], {
    delays: [300],
  })
  await renderReload(server.link, { run: selectedRunFor(5), cache })

  // Live updates reconnect
  countReconnect()
  await vi.waitFor(() => expect(server.requests).toHaveLength(1))

  // A push lands, then the table's page reload writes back what it read before
  pushRun(cache, runFor(5, { n_trains: 1300 }))
  pushRun(cache, runFor(5, { n_trains: 1200 }))

  await vi.waitFor(() => expect(server.answered).toBe(1))
  await settle()
  expect(panelValue(cache, { run: 5, name: 'n_trains' })).toBe(1300)
})

test('mounting after an earlier reconnect asks for nothing until the next one', async () => {
  countReconnect()
  const server = createServer([runFor(5, { n_trains: 1200 })])
  await renderReload(server.link, { run: selectedRunFor(5) })

  await settle()
  expect(server.requests).toEqual([])

  // Live updates reconnect again
  countReconnect()
  await vi.waitFor(() => expect(requestedRuns(server.requests)).toEqual([5]))
})

test('selecting another run asks for nothing, and the next reconnect asks for that run', async () => {
  const server = createServer([
    runFor(5, { n_trains: 1200 }),
    runFor(9, { n_trains: 800 }),
  ])
  const { rerender } = await renderReload(server.link, {
    run: selectedRunFor(5),
  })

  // Select run 9
  await rerender({ run: selectedRunFor(9) })
  await settle()
  expect(server.requests).toEqual([])

  // Live updates reconnect
  countReconnect()
  await vi.waitFor(() => expect(requestedRuns(server.requests)).toEqual([9]))
})

test('a reconnect with no run selected asks for nothing', async () => {
  const server = createServer([runFor(5, { n_trains: 1200 })])
  const { rerender } = await renderReload(server.link, { run: undefined })

  // Live updates reconnect with no run selected
  countReconnect()
  await settle()
  expect(server.requests).toEqual([])

  // Select run 5, then live updates reconnect again
  await rerender({ run: selectedRunFor(5) })
  countReconnect()
  await vi.waitFor(() => expect(requestedRuns(server.requests)).toEqual([5]))
})
