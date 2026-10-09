import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  type FetchResult,
} from '@apollo/client'
import { renderHook } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'

import { setupStore } from '#src/app/store/store'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  TABLE_DATA_QUERY,
  TABLE_META_QUERY,
} from '#src/data/table/table-data.queries'
import { indexRunCells } from '#src/data/table/table-data.transforms'
import type { RunId, Variable } from '#src/data/table/table-data.types'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { useSummaryPlotData } from '#src/features/plots/use-summary-plot-data'
import { countReconnect } from '#src/graphql/live-updates'
import { typePolicies } from '#src/graphql/type-policies'
import { serverCell } from '#tests/support/cells'
import { withProviders } from '#tests/support/render'

// A rebuild is not visible in the output, so the mock is the only surface the
// memo boundary shows on. The real implementation keeps the plots working.
vi.mock('#src/data/table/table-data.transforms', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('#src/data/table/table-data.transforms')
    >()
  return { ...actual, indexRunCells: vi.fn(actual.indexRunCells) }
})

const PROPOSAL = '6996'
const PLOTTED = ['energy', 'intensity']

const runIdsFor = (runs: number[]): RunId[] =>
  runs.map((run) => ({ proposal: PROPOSAL, run }))

// One run as the server sends it, with a value per plotted variable.
const runFor = (run: number, values: Record<string, unknown>) => ({
  __typename: 'DamnitRun',
  database: PROPOSAL,
  proposal: PROPOSAL,
  run,
  cells: Object.entries(values).map(([name, value]) =>
    serverCell({
      database: PROPOSAL,
      proposal: PROPOSAL,
      run,
      name,
      value,
      dtype: typeof value === 'string' ? 'string' : 'number',
    })
  ),
})

const numbersFor = (run: number) => ({ energy: run, intensity: run * 10 })

// What a push leaves in the cache: the runs document the hook watches. The
// merge policy accumulates, so a push may carry only the runs that changed.
function writeRuns(cache: InMemoryCache, runs: ReturnType<typeof runFor>[]) {
  cache.writeQuery({
    query: TABLE_DATA_QUERY,
    variables: {
      proposal: PROPOSAL,
      page: 1,
      per_page: ALL_RUNS_PAGE_SIZE,
      names: ['run', ...PLOTTED],
    },
    data: { runs },
  })
}

function setup(
  runs: ReturnType<typeof runFor>[],
  variables: Record<string, Variable>,
  { link = new ApolloLink(() => null) }: { link?: ApolloLink } = {}
) {
  const store = setupStore()
  store.dispatch(setProposalPending(PROPOSAL))

  const cache = new InMemoryCache({ typePolicies })
  cache.writeQuery({
    query: TABLE_META_QUERY,
    variables: { proposal: PROPOSAL },
    data: {
      metadata: {
        runs: runs.map(({ proposal, run }) => ({ proposal, run })),
        variables,
        tags: {},
        groups: {},
        timestamp: 0,
      },
    },
  })
  writeRuns(cache, runs)

  // The hook is cache-and-network, so it does reach the link. The default link
  // emits nothing, leaving the seeded cache as the only source.
  const client = new ApolloClient({ cache, link })

  return { cache, wrapper: withProviders({ store, client }) }
}

const variableFor = (name: string, title?: string): Variable => ({
  name,
  title,
  tags: [],
})

const titled = {
  energy: variableFor('energy', 'Photon energy'),
  intensity: variableFor('intensity', 'Beam intensity'),
}

const renderSummary = (
  runIds: RunId[],
  wrapper: ReturnType<typeof setup>['wrapper']
) =>
  renderHook(
    (props) =>
      useSummaryPlotData({
        runIds: props!.runIds,
        variables: PLOTTED,
        enabled: true,
      }),
    { wrapper, initialProps: { runIds } }
  )

test('charts a point per run from the values in the cache', async () => {
  const { wrapper } = setup(
    [1, 2, 3].map((run) => runFor(run, numbersFor(run))),
    titled
  )

  const { result } = await renderSummary(runIdsFor([1, 2, 3]), wrapper)

  const [trace] = result.current!.traces
  expect(trace.x?.value).toEqual([1, 2, 3])
  expect(trace.y?.value).toEqual([10, 20, 30])
  expect(trace.x?.name).toBe('Photon energy')
  expect(trace.y?.name).toBe('Beam intensity')
})

test('charts only the runs whose plotted variables are all numbers', async () => {
  const { wrapper } = setup(
    [
      runFor(1, numbersFor(1)),
      // Run 2 never produced an intensity, and run 3's energy is a string.
      runFor(2, { energy: 2 }),
      runFor(3, { energy: 'failed', intensity: 30 }),
      runFor(4, numbersFor(4)),
    ],
    titled
  )

  const { result } = await renderSummary(runIdsFor([1, 2, 3, 4]), wrapper)

  // A half-charted run would pair run 4's energy with run 2's intensity and
  // silently shift every point after it.
  const [trace] = result.current!.traces
  expect(trace.x?.value).toEqual([1, 4])
  expect(trace.y?.value).toEqual([10, 40])
})

test('falls back to the variable name when it has left the context file', async () => {
  const { wrapper } = setup([runFor(1, numbersFor(1))], {
    energy: variableFor('energy', 'Photon energy'),
  })

  const { result } = await renderSummary(runIdsFor([1]), wrapper)

  // The plot outlives the variable it charts, so an axis with no metadata
  // behind it is labelled by name rather than left blank.
  expect(result.current!.meta.x?.name).toBe('Photon energy')
  expect(result.current!.meta.y?.name).toBe('intensity')
})

test('reuses the cell index when the runs it charts change but the data does not', async () => {
  const { wrapper } = setup(
    [1, 2, 3].map((run) => runFor(run, numbersFor(run))),
    titled
  )

  const { result, rerender } = await renderSummary(
    runIdsFor([1, 2, 3]),
    wrapper
  )
  await vi.waitFor(() =>
    expect(result.current!.traces[0].x?.value).toHaveLength(3)
  )

  const builds = vi.mocked(indexRunCells).mock.calls.length

  // Deselecting a run hands the hook a new array without touching the cache.
  await rerender({ runIds: runIdsFor([1, 2]) })

  expect(result.current!.traces[0].x?.value).toEqual([1, 2])
  // Rebuilding here walks every run in the proposal to arrive at the same map.
  expect(vi.mocked(indexRunCells).mock.calls.length).toBe(builds)
})

test('recharts when a deferred value lands on a run it already charts', async () => {
  const { wrapper, cache } = setup(
    [1, 2].map((run) => runFor(run, numbersFor(run))),
    titled
  )

  const { result } = await renderSummary(runIdsFor([1, 2]), wrapper)
  await vi.waitFor(() =>
    expect(result.current!.traces[0].y?.value).toEqual([10, 20])
  )

  // The fill carries run 2 alone, so which runs are cached never changes.
  writeRuns(cache, [runFor(2, { energy: 2, intensity: 999 })])

  await vi.waitFor(() =>
    expect(result.current!.traces[0].y?.value).toEqual([10, 999])
  )
})

// Answers every request with `runs`, which a test replaces to model values
// changing on the server, and counts them. `holdFirst` never answers the first.
function createServer(
  runs: ReturnType<typeof runFor>[],
  { holdFirst = false } = {}
) {
  const link = new ApolloLink((): Observable<FetchResult> => {
    server.requests += 1
    if (holdFirst && server.requests === 1) {
      return new Observable(() => {})
    }
    return Observable.of({ data: { runs: server.runs } })
  })
  const server = { link, runs, requests: 0 }
  return server
}

test('asks again for every run after live updates reconnect', async () => {
  const runs = [1, 2].map((run) => runFor(run, numbersFor(run)))
  const server = createServer(runs)
  const { wrapper } = setup(runs, titled, { link: server.link })
  const { result } = await renderSummary(runIdsFor([1, 2]), wrapper)
  await vi.waitFor(() => expect(server.requests).toBe(1))

  // Run 2 changes while live updates are down, so no push carries it.
  server.runs = [runs[0], runFor(2, { energy: 2, intensity: 999 })]
  countReconnect()

  await vi.waitFor(() =>
    expect(result.current!.traces[0].y?.value).toEqual([10, 999])
  )
})

test('asks again after a reconnect while its first request is still unanswered', async () => {
  const runs = [1, 2].map((run) => runFor(run, numbersFor(run)))
  const server = createServer(runs, { holdFirst: true })
  const { wrapper } = setup(runs, titled, { link: server.link })
  const { result } = await renderSummary(runIdsFor([1, 2]), wrapper)
  await vi.waitFor(() => expect(server.requests).toBe(1))

  // Live updates come back before the API has answered the plot.
  server.runs = [runs[0], runFor(2, { energy: 2, intensity: 999 })]
  countReconnect()

  await vi.waitFor(() =>
    expect(result.current!.traces[0].y?.value).toEqual([10, 999])
  )
})

test('asks for its runs once when opened after an earlier reconnect', async () => {
  countReconnect()
  const runs = [1, 2].map((run) => runFor(run, numbersFor(run)))
  // The server holds a newer run 2, which the chart shows once it has answered.
  const server = createServer([
    runs[0],
    runFor(2, { energy: 2, intensity: 999 }),
  ])
  const { wrapper } = setup(runs, titled, { link: server.link })

  const { result } = await renderSummary(runIdsFor([1, 2]), wrapper)
  await vi.waitFor(() =>
    expect(result.current!.traces[0].y?.value).toEqual([10, 999])
  )

  expect(server.requests).toBe(1)
})

test('asks for its runs once when shown after a reconnect while hidden', async () => {
  const runs = [1, 2].map((run) => runFor(run, numbersFor(run)))
  // The server holds a newer run 2, which the chart shows once it has answered.
  const server = createServer([
    runs[0],
    runFor(2, { energy: 2, intensity: 999 }),
  ])
  const { wrapper } = setup(runs, titled, { link: server.link })
  const { result, rerender } = await renderHook(
    (props) =>
      useSummaryPlotData({
        runIds: runIdsFor([1, 2]),
        variables: PLOTTED,
        enabled: props!.enabled,
      }),
    { wrapper, initialProps: { enabled: false } }
  )

  // Live updates reconnect while the plot is hidden
  countReconnect()
  expect(result.current).toBeNull()

  // The plot shows
  await rerender({ enabled: true })
  await vi.waitFor(() =>
    expect(result.current!.traces[0].y?.value).toEqual([10, 999])
  )

  expect(server.requests).toBe(1)
})
