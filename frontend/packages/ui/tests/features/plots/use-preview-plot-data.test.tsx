import type { PropsWithChildren } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { Provider } from 'react-redux'
import { renderHook } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { buildPreviewQuery } from '#src/features/plots/preview-chunks'
import { usePreviewPlotData } from '#src/features/plots/use-preview-plot-data'

const PROPOSAL = '6996'
const VARIABLE = 'spectrum'

const spectrumFor = (run: number) => ({
  data: [run, run + 1],
  name: VARIABLE,
  dtype: 'array',
  dims: ['pulse'],
  coords: { pulse: [0, 1] },
  attrs: {},
})

// What a landed chunk leaves in the cache. Aliases are erased in the store, so
// writing a chunk's own query is what the chunk loader's response would do.
function writeChunk(cache: InMemoryCache, runs: number[]) {
  cache.writeQuery({
    query: buildPreviewQuery(runs),
    variables: { proposal: PROPOSAL, variable: VARIABLE },
    data: Object.fromEntries(runs.map((run) => [`r${run}`, spectrumFor(run)])),
  })
}

function makeWrapper(store: AppStore, cache: InMemoryCache) {
  // The watcher is cache-only, so it never reaches the link; an empty one keeps
  // the test honest about that.
  const client = new ApolloClient({ cache, link: new ApolloLink(() => null) })

  return function Providers({ children }: PropsWithChildren) {
    return (
      <Provider store={store}>
        <ApolloProvider client={client}>{children}</ApolloProvider>
      </Provider>
    )
  }
}

function setup() {
  const store = setupStore()
  store.dispatch(setProposalPending(PROPOSAL))
  const cache = new InMemoryCache()

  return { store, cache, wrapper: makeWrapper(store, cache) }
}

const renderPreview = (
  runs: number[],
  wrapper: ReturnType<typeof makeWrapper>
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
