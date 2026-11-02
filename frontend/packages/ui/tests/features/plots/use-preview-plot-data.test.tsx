import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { renderHook } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'

import { setupStore } from '#src/app/store/store'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import { LIGHTWEIGHT_TABLE_DATA_QUERY } from '#src/data/table/table-data.queries'
import { buildPreviewQuery } from '#src/features/plots/preview-chunks'
import { usePreviewPlotData } from '#src/features/plots/use-preview-plot-data'
import { typePolicies } from '#src/graphql/type-policies'
import { serverCell } from '#tests/support/cells'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '6996'
const VARIABLE = 'spectrum'

const spectrumFor = (run: number) => ({
  data: [run, run + 1],
  name: VARIABLE,
  dtype: 'array1d',
  dims: ['pulse'],
  coords: { pulse: [0, 1] },
  attrs: {},
})

function at(minute: number) {
  return Date.UTC(2026, 10, 2, 12, minute)
}

// What a landed chunk leaves in the cache. Aliases are erased in the store, so
// writing a chunk's own query is what the chunk loader's response would do.
function writeChunk(
  cache: InMemoryCache,
  runs: number[],
  { valueFor = spectrumFor }: { valueFor?: (run: number) => unknown } = {}
) {
  cache.writeQuery({
    query: buildPreviewQuery(runs),
    variables: { proposal: PROPOSAL, variable: VARIABLE },
    data: Object.fromEntries(runs.map((run) => [`r${run}`, valueFor(run)])),
  })
}

// What the cells query or a push leaves in the cache: each run's cell for the
// plotted variable, computed at the given time.
function writeCells(
  cache: InMemoryCache,
  computedAtByRun: Record<number, number | null>
) {
  cache.writeQuery({
    query: LIGHTWEIGHT_TABLE_DATA_QUERY,
    variables: {
      proposal: PROPOSAL,
      page: 1,
      per_page: ALL_RUNS_PAGE_SIZE,
      names: ['run', VARIABLE],
    },
    data: {
      runs: Object.entries(computedAtByRun).map(([run, computedAt]) => ({
        __typename: 'DamnitRun',
        database: PROPOSAL,
        proposal: PROPOSAL,
        run: Number(run),
        cells: [
          {
            ...serverCell({
              database: PROPOSAL,
              proposal: PROPOSAL,
              run: Number(run),
              name: VARIABLE,
              value: null,
              dtype: 'array',
            }),
            computed_at: computedAt,
          },
        ],
      })),
    },
  })
}

function setup({ link = new ApolloLink(() => null) } = {}) {
  const store = setupStore()
  store.dispatch(setProposalPending(PROPOSAL))
  const cache = new InMemoryCache({ typePolicies })
  // Only the cells query reaches the link, and the default one answers nothing,
  // so the seeded cache is the only source.
  const client = new ApolloClient({ cache, link })

  return { store, cache, wrapper: withProviders({ store, client }) }
}

const renderPreview = (
  runs: number[],
  wrapper: ReturnType<typeof withProviders>
) =>
  renderHook(
    () => usePreviewPlotData({ runs, variable: VARIABLE, enabled: true }),
    { wrapper }
  )

test('a preview plots the runs already cached and grows as the rest land', async () => {
  const { cache, wrapper } = setup()
  const runs = [1, 2, 3, 4]

  // The first chunk has come back; the second is still in flight.
  writeChunk(cache, [1, 2])

  const { result } = await renderPreview(runs, wrapper)

  // Partial data is plotted rather than withheld: the plot fills in as chunks
  // land instead of staying blank until the whole run set is home.
  expect(result.current.data.traces).toHaveLength(2)
  expect(result.current.data.traces[0].y?.name).toBe('Run 1')
  expect(result.current.data.meta.type).toBe('scatter')

  // The second chunk lands.
  writeChunk(cache, [3, 4])

  await vi.waitFor(() => {
    expect(result.current.data.traces).toHaveLength(4)
  })
  expect(result.current.data.traces.map((trace) => trace.y?.name)).toEqual([
    'Run 1',
    'Run 2',
    'Run 3',
    'Run 4',
  ])
})

test('a preview with nothing cached yet plots no traces', async () => {
  const { wrapper } = setup()

  const { result } = await renderPreview([1, 2], wrapper)

  expect(result.current.data.traces).toEqual([])
})

test('a preview hands back one chunk per group of runs to load', async () => {
  const { wrapper } = setup()

  // Runs 1-51 straddle the boundary at 50. The caller renders a loader per
  // chunk, so this is what decides how many go out.
  const { result } = await renderPreview(
    Array.from({ length: 51 }, (_, i) => i + 1),
    wrapper
  )

  expect(result.current.chunks).toHaveLength(2)
  expect(result.current.chunks[1]).toEqual([50, 51])
})

test('a disabled preview asks for no chunks at all', async () => {
  const { wrapper } = setup()

  const { result } = await renderHook(
    () =>
      usePreviewPlotData({ runs: [1, 2], variable: VARIABLE, enabled: false }),
    { wrapper }
  )

  // A summary plot shares the container; nothing preview-shaped should fetch.
  expect(result.current.chunks).toEqual([])
  expect(result.current.data.traces).toEqual([])
})

test('a preview dates its data by the newest time over the runs it draws', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1, 2, 3])
  writeCells(cache, { 1: at(1), 2: at(3), 3: at(2), 4: at(9) })

  const { result } = await renderPreview([1, 2, 3], wrapper)

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(3))
  })
})

test('a preview leaves a run with no preview data or no time out of its data age', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1, 2, 3], {
    valueFor: (run) =>
      run === 3 ? { ...spectrumFor(run), data: null } : spectrumFor(run),
  })
  writeCells(cache, { 1: at(1), 2: null, 3: at(9) })

  const { result } = await renderPreview([1, 2, 3], wrapper)

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(1))
  })
})

test('an image preview over several runs draws and dates its first run alone', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1, 2], {
    valueFor: (run) => ({
      data: `data:image/png;base64,run${run}`,
      name: VARIABLE,
      dtype: 'image',
      attrs: {},
    }),
  })
  writeCells(cache, { 1: at(1), 2: at(5) })

  const { result } = await renderPreview([1, 2], wrapper)

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(1))
  })
  expect(result.current.data.traces).toHaveLength(1)
  expect(result.current.data.traces[0].data?.name).toBe('Run 1')
})

test('a preview whose drawn runs have no time has no data age', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1, 2])
  writeCells(cache, { 1: null, 2: null, 3: at(4) })

  const { result } = await renderPreview([1, 2, 3], wrapper)

  // Runs 1 and 2 are drawn, and neither cell has a time.
  expect(result.current.data.traces).toHaveLength(2)
  expect(result.current.computedAt).toBeNull()

  // Run 3 lands with a time, so the cells were read all along.
  writeChunk(cache, [3])

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(4))
  })
})

test('a preview records the time of a run whose cell lands after its data', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1])

  const { result } = await renderPreview([1], wrapper)

  // The data is drawn, but its cell is not in yet.
  expect(result.current.data.traces).toHaveLength(1)
  expect(result.current.computedAt).toBeNull()

  // The cell lands.
  writeCells(cache, { 1: at(2) })

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(2))
  })
})

test('a preview records the time a cell holds when its run data lands', async () => {
  const { cache, wrapper } = setup()
  writeCells(cache, { 1: at(1) })

  const { result } = await renderPreview([1], wrapper)

  // The cell is in, but its run data is not.
  expect(result.current.computedAt).toBeNull()

  // The run is reprocessed before its chunk is fetched, so the data that lands
  // is the newer one.
  writeCells(cache, { 1: at(5) })
  writeChunk(cache, [1])

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(5))
  })
})

test('a preview keeps the time it recorded when a push brings a newer one', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1])
  writeCells(cache, { 1: at(2) })

  const { result } = await renderPreview([1, 2], wrapper)

  // Run 1 is drawn with the time its cell holds.
  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(2))
  })

  // Run 1 is reprocessed after its data was drawn, and run 2 lands after the
  // push: its time shows, so the hook has read the pushed cells.
  writeCells(cache, { 1: at(30), 2: at(5) })
  writeChunk(cache, [2])

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(5))
  })
})

test('a preview dates a run again only when new data replaces what it draws', async () => {
  const { cache, wrapper } = setup()
  writeChunk(cache, [1])
  writeCells(cache, { 1: at(2) })

  const { result } = await renderPreview([1, 2], wrapper)

  // Run 1 is drawn with the time its cell holds.
  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(2))
  })

  // Run 1 is reprocessed, and its chunk is fetched again with the same data
  // beside run 2: run 2's time shows, so the hook has read the refetch.
  writeCells(cache, { 1: at(30), 2: at(5) })
  writeChunk(cache, [1, 2])

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(5))
  })

  // The chunk is fetched again with the reprocessed data.
  writeChunk(cache, [1], {
    valueFor: (run) => ({ ...spectrumFor(run), data: [9, 9] }),
  })

  await vi.waitFor(() => {
    expect(result.current.computedAt).toBe(at(30))
  })
})

test('a disabled preview sends no query for its cells', async () => {
  const operations: string[] = []
  const link = new ApolloLink((operation) => {
    operations.push(operation.operationName ?? '')
    return Observable.of()
  })
  const { wrapper } = setup({ link })

  // A summary plot calls the hook disabled over every run, beside its own
  // query, so a second one here would go out with every summary plot.
  let enabled = false
  const { result, rerender } = await renderHook(
    () => usePreviewPlotData({ runs: [1, 2], variable: VARIABLE, enabled }),
    { wrapper }
  )

  expect(result.current.computedAt).toBeNull()
  expect(operations).toEqual([])

  // The preview is enabled, so its cells are wanted now.
  enabled = true
  await rerender()

  await vi.waitFor(() => {
    expect(operations).toEqual(['LightweightTableDataQuery'])
  })
})

test('a preview with no runs sends no query for its cells', async () => {
  const operations: string[] = []
  const link = new ApolloLink((operation) => {
    operations.push(operation.operationName ?? '')
    return Observable.of()
  })
  const { wrapper } = setup({ link })

  // With no runs, no cells are wanted.
  let runs: number[] = []
  const { rerender } = await renderHook(
    () => usePreviewPlotData({ runs, variable: VARIABLE, enabled: true }),
    { wrapper }
  )

  expect(operations).toEqual([])

  // A run is added, so the cells are wanted now.
  runs = [1]
  await rerender()

  await vi.waitFor(() => {
    expect(operations).toEqual(['LightweightTableDataQuery'])
  })
})
