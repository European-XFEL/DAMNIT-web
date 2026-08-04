import { StrictMode, type PropsWithChildren } from 'react'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  type FetchResult,
  type Operation,
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
import { useTableRuns } from '#src/features/table/hooks/use-table-runs'
import type { Rectangle } from '#src/features/table/types/table.types'
import type { RunCells } from '#src/data/table/table-data.types'
import { serverCell } from '#tests/support/cells'

const PROPOSAL = '900405'
const PAGE_SIZE = 10
const LIGHTWEIGHT_NAME = `Lightweight${TABLE_DATA_QUERY_NAME}`

// The stamp store is module state shared across tests: reset it so one test's
// push cannot flash a later test's runs.
afterEach(() => {
  liveRunStamps(new Map())
  vi.restoreAllMocks()
})

// A run whose only cell is a heavy value @lightweight held back, so the hook
// always has a deferred pass to fire for the page.
const runFor = (run: number) => ({
  __typename: 'DamnitRun',
  database: PROPOSAL,
  proposal: PROPOSAL,
  run,
  cells: [
    serverCell({
      database: PROPOSAL,
      proposal: PROPOSAL,
      run,
      name: 'spectrum',
      value: null,
      dtype: 'array1d',
    }),
  ],
})

// The same run once the deferred pass has brought its heavy value back.
const filledRunFor = (run: number) => ({
  ...runFor(run),
  cells: [
    serverCell({
      database: PROPOSAL,
      proposal: PROPOSAL,
      run,
      name: 'spectrum',
      value: [1, 2, 3],
      dtype: 'array1d',
    }),
  ],
})

// A run with nothing held back: its only cell is a scalar the lightweight pass
// already answers, the way a run whose heavy variables never ran comes back.
const scalarRunFor = (run: number) => ({
  ...runFor(run),
  cells: [
    serverCell({
      database: PROPOSAL,
      proposal: PROPOSAL,
      run,
      name: 'energy',
      value: 1,
    }),
  ],
})

// A scroll window centered on `y`. At pageSize 10 it maps to a small band of
// pages (`pageRangeForRegion`), which is all the test needs: y 0 sits on pages
// 1 to 3, y 200 sits ~20 pages down and shares no page with it.
const regionAt = (y: number): Rectangle => ({ x: 0, y, width: 100, height: 5 })

// The ways a mocked request ends: it answers with rows and closes, it refuses,
// or it stays open until the test cancels it.
const answers = (runs: unknown[]) =>
  new Observable<FetchResult>((observer) => {
    observer.next({ data: { runs } })
    observer.complete()
  })

const refuses = (message: string) =>
  new Observable<FetchResult>((observer) => {
    observer.error(new Error(message))
  })

const hangs = () => new Observable<FetchResult>(() => {})

// Records the cancellation, so a test can prove the hook gave the request up
// rather than waiting out an answer nobody reads.
const hangsUntilCancelled = (onCancel: () => void) =>
  new Observable<FetchResult>(() => onCancel)

// Rejects the request when the hook aborts it, the way `HttpLink` does. An
// abort has to reach the observer, or nothing tells the hook the page is gone.
const rejectsOnAbort = (
  operation: Operation,
  observer: { error: (reason: unknown) => void },
  onAbort: () => void
) => {
  const { signal } = operation.getContext().fetchOptions as {
    signal: AbortSignal
  }
  signal.addEventListener('abort', () => {
    onAbort()
    observer.error(new DOMException('Aborted', 'AbortError'))
  })
}

// Answers the lightweight page reads at once, recording which pages started and
// which were cancelled, so a test drives the timing by scrolling. Deferred reads
// hang unless `answerDeferred` or `failDeferred`, which is how a test gets a page
// past merely in flight.
function createNetwork({ answerDeferred = false, failDeferred = false } = {}) {
  const started = { lightweight: [] as number[], deferred: [] as number[] }
  const cancelled = { deferred: [] as number[] }

  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      started.lightweight.push(page)
      return answers([runFor(page)])
    }
    started.deferred.push(page)
    if (failDeferred) {
      return refuses('the server cannot answer this page')
    }
    if (answerDeferred) {
      return answers([filledRunFor(page)])
    }
    return hangsUntilCancelled(() => cancelled.deferred.push(page))
  })

  return { link, started, cancelled }
}

const heavyValueFor = (cells: Map<string, RunCells>, run: number): unknown =>
  cells.get(`${PROPOSAL}:${run}`)?.spectrum?.summary.value

const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

async function renderTableRuns(
  network: { link: ApolloLink },
  {
    strict = false,
    priorityLink = true,
    cache = new InMemoryCache({ typePolicies }),
  }: {
    strict?: boolean
    // Off when a test needs the hook alone to hold the one-at-a-time cap.
    priorityLink?: boolean
    // Pre-seeded when a test starts from what another reader already cached.
    cache?: InMemoryCache
  } = {}
) {
  const client = new ApolloClient({
    cache,
    link: priorityLink
      ? ApolloLink.from([
          createPriorityLink({
            maxActive: 1,
            queuedOperations: [DEFERRED_TABLE_DATA_QUERY_NAME],
          }),
          network.link,
        ])
      : network.link,
  })

  function Providers({ children }: PropsWithChildren) {
    const tree = <ApolloProvider client={client}>{children}</ApolloProvider>
    return strict ? <StrictMode>{tree}</StrictMode> : tree
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
      return answers([runFor(page)])
    }
    return hangs()
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

test('cancels a page’s in-flight deferred fetch when it scrolls out of view', async () => {
  const network = createNetwork()
  const { result } = await renderTableRuns(network)

  // Page 1's deferred pass is in flight, holding the single throttle slot.
  await vi.waitFor(() => expect(network.started.deferred).toContain(1))

  // Scroll far past page 1 before its heavy values arrive.
  result.current.onVisibleRegionChanged(regionAt(200))

  // Page 1 is cancelled, freeing the slot for the page the user landed on.
  await vi.waitFor(() => expect(network.started.deferred).toContain(20))
  expect(network.cancelled.deferred).toEqual([1])
})

test('re-requests a deferred fetch after scrolling back to a cancelled page', async () => {
  const network = createNetwork()
  const { result } = await renderTableRuns(network)

  // Fetch page 1, then scroll away so it is cancelled rather than completed.
  await vi.waitFor(() => expect(network.started.deferred).toContain(1))
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(network.started.deferred).toContain(20))

  // Back to the top: a cancelled page is not done, so its deferred pass fires
  // again instead of leaving its heavy cells skeletoned forever.
  result.current.onVisibleRegionChanged(regionAt(0))
  await vi.waitFor(() =>
    expect(network.started.deferred.filter((page) => page === 1)).toHaveLength(
      2
    )
  )
})

test('does not re-issue a scrolled-away page’s deferred pass when a later page lands', async () => {
  const started = { deferred: [] as number[] }

  // Page 1's heavy values never arrive, so its fetch is still cancellable when
  // the user scrolls away. Every other page answers, which frees the single
  // throttle slot so a re-issued page 1 would really reach the link.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return answers([runFor(page)])
    }
    started.deferred.push(page)
    if (page === 1) {
      return new Observable(() => {})
    }
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started.deferred).toContain(1))

  // Scroll far past page 1, cancelling it. The pages landed on then fill, and
  // each of those cache writes is what used to re-fire page 1.
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(started.deferred).toContain(20))
  await settle()

  expect(started.deferred.filter((page) => page === 1)).toHaveLength(1)
})

test('does not fetch heavy values for a page the user has already scrolled past', async () => {
  const started = { deferred: [] as number[] }
  const pending: Array<() => void> = []

  // Every page but the first holds its rows back until the test releases them,
  // so a page fetch can resolve after the user has scrolled somewhere else.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return new Observable((observer) => {
        const answer = () => {
          observer.next({ data: { runs: [runFor(page)] } })
          observer.complete()
        }
        if (page === 1) {
          answer()
          return
        }
        pending.push(answer)
      })
    }
    started.deferred.push(page)
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started.deferred).toContain(1))

  // Ask for pages 20 to 23, then return to the top before any of them answer.
  result.current.onVisibleRegionChanged(regionAt(200))
  await settle()
  result.current.onVisibleRegionChanged(regionAt(0))
  await settle()

  pending.forEach((answer) => answer())
  await settle()

  // Pages 2 and 3 are on screen and get their heavy values; page 20 resolved
  // into a window nobody is looking at and must not spend the throttle slot.
  expect(started.deferred).toContain(2)
  expect(started.deferred).toContain(3)
  expect(started.deferred).not.toContain(20)
})

test('does not re-request a page whose deferred pass already finished', async () => {
  const network = createNetwork({ answerDeferred: true })
  const { result } = await renderTableRuns(network)

  // Wait for the heavy value itself, not merely for the request to leave: an
  // in-flight page is skipped for a different reason than a finished one, so
  // waiting on the request would pass even with no record of finished pages.
  await vi.waitFor(() =>
    expect(heavyValueFor(result.current.cellsByKey, 1)).toEqual([1, 2, 3])
  )

  // Settle on a window spanning pages 1 to 3: the two new pages load, and page 1
  // comes back into view having already been filled.
  result.current.onVisibleRegionChanged(regionAt(0))

  await vi.waitFor(() => expect(network.started.deferred).toContain(3))
  // Asking again would re-download every heavy value on the page.
  expect(network.started.deferred.filter((page) => page === 1)).toHaveLength(1)
})

test('asks for a heavy column that first appears on a later page', async () => {
  const deferredNames: Record<number, string[]> = {}

  // Page 1 holds back only `spectrum`. Later pages hold back `preview` too, the
  // way a variable added to the context file mid-session shows up.
  const runWithNewColumn = (run: number) => ({
    ...runFor(run),
    cells: ['spectrum', 'preview'].map((name) =>
      serverCell({
        database: PROPOSAL,
        proposal: PROPOSAL,
        run,
        name,
        value: null,
        dtype: 'array1d',
      })
    ),
  })

  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return new Observable((observer) => {
        observer.next({
          data: { runs: [page === 1 ? runFor(page) : runWithNewColumn(page)] },
        })
        observer.complete()
      })
    }
    deferredNames[page] = operation.variables.names as string[]
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(deferredNames[1]).toBeDefined())

  result.current.onVisibleRegionChanged(regionAt(200))

  await vi.waitFor(() => expect(deferredNames[20]).toBeDefined())
  expect(deferredNames[20]).toContain('preview')
})

test('asks a page only for the columns it held back', async () => {
  const deferredNames: Record<number, string[]> = {}

  // Only page 20 holds back `preview`. The pages beside it hold back `spectrum`
  // alone, so one shared list would ask them for a column they never blanked.
  const runWithPreview = (run: number) => ({
    ...runFor(run),
    cells: ['spectrum', 'preview'].map((name) =>
      serverCell({
        database: PROPOSAL,
        proposal: PROPOSAL,
        run,
        name,
        value: null,
        dtype: 'array1d',
      })
    ),
  })

  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return new Observable((observer) => {
        observer.next({
          data: { runs: [page === 20 ? runWithPreview(page) : runFor(page)] },
        })
        observer.complete()
      })
    }
    deferredNames[page] = operation.variables.names as string[]
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(deferredNames[1]).toBeDefined())

  // Scrolling to y 200 loads pages 20, 21 and 22, and page 20 is scanned first.
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(deferredNames[21]).toBeDefined())

  expect(deferredNames[20]).toContain('preview')
  expect(deferredNames[21]).toContain('spectrum')
  expect(deferredNames[21]).not.toContain('preview')
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

test('stops retrying a page after three failed deferred passes', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const network = createNetwork({ failDeferred: true })
  const { result } = await renderTableRuns(network)

  const triesForPageOne = () =>
    network.started.deferred.filter((page) => page === 1).length

  // Page 1 is the only page on screen at mount, so it spends its whole budget
  // straight away: a failed pass hands the slot back and the next try goes out.
  await vi.waitFor(() => expect(triesForPageOne()).toBe(3))

  // Five more settles. A server that cannot answer must not hold the single
  // throttle slot for the rest of the session.
  for (let scroll = 0; scroll < 5; scroll += 1) {
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
  }

  expect(triesForPageOne()).toBe(3)
})

test('retries a failed page only after its neighbours have had a turn', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const started: number[] = []

  // Page 2's heavy values always fail. Its neighbours answer, so always
  // reaching for the lowest page would spend page 2's budget before theirs.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return answers([runFor(page)])
    }
    started.push(page)
    if (page === 2) {
      return refuses('the server cannot answer this page')
    }
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started).toContain(1))

  // Settle on pages 2 to 4 and let page 2 exhaust its three tries.
  result.current.onVisibleRegionChanged(regionAt(15))
  await vi.waitFor(() =>
    expect(started.filter((page) => page === 2)).toHaveLength(3)
  )

  const firstTry = started.indexOf(2)
  const retry = started.indexOf(2, firstTry + 1)
  expect(retry).toBeGreaterThan(started.indexOf(3))
  expect(retry).toBeGreaterThan(started.indexOf(4))
})

test('gives the throttle slot to a visible page when the page holding it scrolls away', async () => {
  const started: number[] = []
  const cancelled: number[] = []

  // Page 1's heavy values never arrive, so it holds the slot until something
  // takes it away. Every other page answers.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return answers([runFor(page)])
    }
    started.push(page)
    if (page === 1) {
      return hangsUntilCancelled(() => cancelled.push(page))
    }
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started).toContain(1))

  // A window over pages 1 to 4, then one page down to pages 2 to 4. Page 1
  // leaves holding the slot, and no page enters that still needs loading.
  result.current.onVisibleRegionChanged(regionAt(10))
  await settle()
  result.current.onVisibleRegionChanged(regionAt(15))

  // Page 2 is on screen with blank heavy cells, so it must not wait out a
  // request for a page nobody is looking at.
  await vi.waitFor(() => expect(started).toContain(2))
  expect(cancelled).toEqual([1])
})

test('asks for one page’s heavy values at a time', async () => {
  const inFlight = { now: 0, most: 0 }

  // No priority link in this chain, so the one-at-a-time cap has to come from
  // the hook. Answering on a later task leaves room for a second to overlap.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return answers([runFor(page)])
    }
    return new Observable((observer) => {
      inFlight.now += 1
      inFlight.most = Math.max(inFlight.most, inFlight.now)
      setTimeout(() => {
        inFlight.now -= 1
        observer.next({ data: { runs: [filledRunFor(page)] } })
        observer.complete()
      }, 20)
    })
  })

  const { result } = await renderTableRuns({ link }, { priorityLink: false })

  // A window over pages 1 to 4, each holding a heavy value back.
  result.current.onVisibleRegionChanged(regionAt(10))
  await vi.waitFor(() =>
    expect(heavyValueFor(result.current.cellsByKey, 4)).toEqual([1, 2, 3])
  )

  expect(inFlight.most).toBe(1)
})

test('does not fetch heavy values for a page whose fetch resolves after teardown', async () => {
  const started = { deferred: [] as number[] }
  const pending: Array<() => void> = []

  // A scrolled page's rows are held until the test releases them, and the abort
  // is not wired to the observer: aborting cannot reject a fetch whose answer
  // has already arrived, which is the race the guard is there for.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return new Observable((observer) => {
        const answer = () => {
          observer.next({ data: { runs: [runFor(page)] } })
          observer.complete()
        }
        if (page === 1) {
          answer()
          return
        }
        pending.push(answer)
      })
    }
    started.deferred.push(page)
    return hangs()
  })

  const { result, unmount } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started.deferred).toContain(1))

  // Scroll so a page fetch goes out, then leave the proposal before it answers.
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0))
  await unmount()

  // The page lands after the teardown eviction. It must not start a heavy
  // request for the proposal the user has left, which nothing can now cancel.
  pending.forEach((answer) => answer())
  await settle()

  expect(started.deferred).toEqual([1])
})

test('retries a failed page after it scrolls back into view', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const network = createNetwork({ failDeferred: true })
  const { result } = await renderTableRuns(network)

  const triesForPageOne = () =>
    network.started.deferred.filter((page) => page === 1).length

  // Spend page 1's whole budget while it stays on screen.
  for (let scroll = 0; scroll < 5; scroll += 1) {
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
  }
  expect(triesForPageOne()).toBe(3)

  // Away and back. A server that has recovered in the meantime must not stay
  // written off for the rest of the session.
  result.current.onVisibleRegionChanged(regionAt(200))
  await settle()
  result.current.onVisibleRegionChanged(regionAt(0))
  await settle()

  expect(triesForPageOne()).toBeGreaterThan(3)
})

test('leaves an in-flight deferred fetch alone when the pages scrolled to are already loaded', async () => {
  const started = { deferred: [] as number[] }
  const cancelled: number[] = []

  // Page 1's heavy values never arrive; every other page's do, so a scroll can
  // land on a window that needs nothing.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return answers([runFor(page)])
    }
    started.deferred.push(page)
    if (page === 1) {
      return hangsUntilCancelled(() => cancelled.push(page))
    }
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })

  // Scroll away while page 1 is in flight: the pages landed on still need the
  // slot, so page 1 gives it up.
  await vi.waitFor(() => expect(started.deferred).toContain(1))
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(cancelled).toEqual([1]))

  // Back to the top, which re-issues page 1 and fills pages 2 and 3.
  result.current.onVisibleRegionChanged(regionAt(0))
  await settle()
  expect(started.deferred.filter((page) => page === 1)).toHaveLength(2)

  // Away again, but every page landed on is filled by now. Tearing page 1 down
  // would free a slot nobody is waiting for and throw its work away.
  result.current.onVisibleRegionChanged(regionAt(200))
  await settle()

  expect(cancelled).toEqual([1])
})

test('leaves an in-flight deferred fetch alone when the visible pages hold nothing back', async () => {
  const started = { lightweight: [] as number[], deferred: [] as number[] }
  const cancelled: number[] = []

  // Page 1 holds a heavy value back and its deferred pass never answers. Every
  // other page is scalar-only, so it loads with nothing to defer.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      started.lightweight.push(page)
      return new Observable((observer) => {
        observer.next({
          data: { runs: [page === 1 ? runFor(page) : scalarRunFor(page)] },
        })
        observer.complete()
      })
    }
    started.deferred.push(page)
    return hangsUntilCancelled(() => cancelled.push(page))
  })

  const { result } = await renderTableRuns({ link })

  // Scroll away before those pages have loaded: what they hold back is not known
  // yet, so page 1 gives up the slot.
  await vi.waitFor(() => expect(started.deferred).toContain(1))
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(cancelled).toEqual([1]))
  await vi.waitFor(() =>
    expect(started.lightweight).toEqual(
      expect.arrayContaining([20, 21, 22, 23])
    )
  )

  // Back to the top, which re-issues page 1.
  result.current.onVisibleRegionChanged(regionAt(0))
  await settle()
  expect(started.deferred.filter((page) => page === 1)).toHaveLength(2)

  // Away again. Those pages are loaded and hold nothing back, so tearing page 1
  // down would free a slot nobody is waiting for.
  result.current.onVisibleRegionChanged(regionAt(200))
  await settle()

  expect(cancelled).toEqual([1])
})

test('aborts an in-flight page fetch when the hook unmounts', async () => {
  const started = { lightweight: [] as number[], deferred: [] as number[] }
  const aborted: number[] = []

  // Page 1 answers at once; a scrolled page's lightweight fetch hangs until its
  // request is aborted, the way a proposal switch races a page fetch already in
  // flight. Unmounting cannot reach a query the hook does not hold, so an abort
  // is the only thing that stops it.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      started.lightweight.push(page)
      return new Observable((observer) => {
        if (page === 1) {
          observer.next({ data: { runs: [runFor(page)] } })
          observer.complete()
          return
        }
        rejectsOnAbort(operation, observer, () => aborted.push(page))
      })
    }
    started.deferred.push(page)
    return hangs()
  })

  const { result, unmount } = await renderTableRuns({ link })

  // Page 1's deferred pass starts; then scroll far down so a fetchMore for a
  // later page goes out and hangs.
  await vi.waitFor(() => expect(started.deferred).toContain(1))
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(started.lightweight.length).toBeGreaterThan(1))

  await unmount()

  // The aborted request never resolves, so it cannot write the departed
  // proposal's runs back into the swept cache or start a deferred pass for them.
  await vi.waitFor(() => expect(aborted.length).toBeGreaterThan(0))
  expect(started.deferred).toEqual([1])
})

test('aborts a page fetch when its page scrolls out of the window', async () => {
  const aborted: number[] = []

  // Page 1 answers at once; every scrolled page hangs, so its fetch is still in
  // flight when the next scroll moves the window off it.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName !== LIGHTWEIGHT_NAME) {
      return hangs()
    }
    return new Observable((observer) => {
      if (page === 1) {
        observer.next({ data: { runs: [runFor(page)] } })
        observer.complete()
        return
      }
      rejectsOnAbort(operation, observer, () => aborted.push(page))
    })
  })

  const { result } = await renderTableRuns({ link })

  // Settle on page 20's window, then scroll far past it before it answers.
  result.current.onVisibleRegionChanged(regionAt(200))
  await settle()
  result.current.onVisibleRegionChanged(regionAt(400))

  // A page nobody is looking at only delays the one the user landed on: this
  // pass is un-throttled, so those requests compete rather than queue.
  await vi.waitFor(() => expect(aborted).toContain(20))
})

test('asks a page for its heavy values again when the pass brings no payload', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const started: number[] = []

  // The deferred pass resolves with no payload rather than erroring, which is
  // how a resolver that produced nothing comes back.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      return answers([runFor(page)])
    }
    started.push(page)
    return new Observable((observer) => {
      observer.next({ data: null })
      observer.complete()
    })
  })

  await renderTableRuns({ link })

  // A page that brought nothing back is not done, so it spends its retry budget
  // rather than leaving its heavy cells blank for the session.
  await vi.waitFor(() =>
    expect(started.filter((page) => page === 1)).toHaveLength(3)
  )
})

test('does not fetch heavy values for a page that held nothing back', async () => {
  const started = { lightweight: [] as number[], deferred: [] as number[] }

  // The proposal's runs stop at page 21, so the tail of the padded window comes
  // back empty. Scrolling to y 200 asks for pages 20 through 23.
  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      started.lightweight.push(page)
      return new Observable((observer) => {
        observer.next({ data: { runs: page > 21 ? [] : [runFor(page)] } })
        observer.complete()
      })
    }
    started.deferred.push(page)
    return answers([filledRunFor(page)])
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started.deferred).toContain(1))

  // Settle on the window: the empty page loads and holds nothing back.
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(started.lightweight).toContain(22))
  await settle()

  expect(started.deferred).toContain(21)
  expect(started.deferred).not.toContain(22)

  // Settle on it again, which takes the cached-page path rather than the fetch
  // path, and must reach the same answer.
  result.current.onVisibleRegionChanged(regionAt(200))
  await settle()

  expect(started.deferred).not.toContain(22)
})

test('does not report a page fetch aborted by a proposal switch as a failure', async () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
  const started: number[] = []
  const aborted: number[] = []

  const link = new ApolloLink((operation) => {
    if (operation.operationName !== LIGHTWEIGHT_NAME) {
      return hangs()
    }
    const page = (operation.variables.page as number) ?? 1
    started.push(page)
    return new Observable((observer) => {
      if (page === 1) {
        observer.next({ data: { runs: [runFor(page)] } })
        observer.complete()
        return
      }
      rejectsOnAbort(operation, observer, () => aborted.push(page))
    })
  })

  const { result, unmount } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started).toContain(1))
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(started.length).toBeGreaterThan(1))

  await unmount()

  await vi.waitFor(() => expect(aborted.length).toBeGreaterThan(0))
  expect(reported).not.toHaveBeenCalled()
})

test('reports a page fetch that fails and asks for it again', async () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
  const started: number[] = []

  const link = new ApolloLink((operation) => {
    if (operation.operationName !== LIGHTWEIGHT_NAME) {
      return hangs()
    }
    const page = (operation.variables.page as number) ?? 1
    started.push(page)
    return new Observable((observer) => {
      if (page === 1) {
        observer.next({ data: { runs: [runFor(page)] } })
        observer.complete()
        return
      }
      observer.error(new Error('the server cannot answer this page'))
    })
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started).toContain(1))

  // Scroll to a page the server cannot answer.
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(reported).toHaveBeenCalled())

  // Scroll away and back: rows matter more than images, so it keeps trying.
  const attempts = started.length
  result.current.onVisibleRegionChanged(regionAt(0))
  await settle()
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(started.length).toBeGreaterThan(attempts))
})

test('asks for a page again when its fetch brings no payload', async () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
  const started: number[] = []

  // No `errors`, so the fetch resolves rather than rejecting, and the handler
  // that reads the page's runs is the one that has to cope with it.
  const link = new ApolloLink((operation) => {
    if (operation.operationName !== LIGHTWEIGHT_NAME) {
      return hangs()
    }
    const page = (operation.variables.page as number) ?? 1
    started.push(page)
    return new Observable((observer) => {
      observer.next(
        page === 1 ? { data: { runs: [runFor(page)] } } : { data: null }
      )
      observer.complete()
    })
  })

  const { result } = await renderTableRuns({ link })
  await vi.waitFor(() => expect(started).toContain(1))

  // Scroll to a page that answers with nothing.
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() => expect(reported).toHaveBeenCalled())

  // Away and back. A page left mid-fetch, or marked loaded with nothing in it,
  // is never asked for again; one left idle is.
  result.current.onVisibleRegionChanged(regionAt(0))
  await settle()
  result.current.onVisibleRegionChanged(regionAt(200))
  await vi.waitFor(() =>
    expect(started.filter((page) => page === 20)).toHaveLength(2)
  )
})

test('records a scrolled page’s deferred pass after a StrictMode remount', async () => {
  // Dev StrictMode runs the mount effects setup, cleanup, setup. The cleanup
  // stops every in-flight fetch and drops the page bookkeeping, so the second
  // setup has to re-issue page 1 rather than read it as already handled.
  const network = createNetwork()
  const { result } = await renderTableRuns(network, { strict: true })

  await vi.waitFor(() => expect(network.started.deferred).toContain(1))

  // Scroll past page 1 so a fetchMore for the landed page goes out and resolves.
  result.current.onVisibleRegionChanged(regionAt(200))

  await vi.waitFor(() => expect(network.started.deferred).toContain(20))
})

test('loads page 1 again when a StrictMode remount aborts the first attempt', async () => {
  const started: number[] = []

  // Answers on a later task and honours the abort signal, the way a network and
  // `HttpLink` do: the remount asks again while the aborted request is open.
  const link = new ApolloLink((operation) => {
    if (operation.operationName !== LIGHTWEIGHT_NAME) {
      return hangs()
    }
    const page = (operation.variables.page as number) ?? 1
    started.push(page)
    const { signal } = operation.getContext().fetchOptions as {
      signal: AbortSignal
    }
    return new Observable((observer) => {
      const answer = setTimeout(() => {
        if (signal.aborted) {
          observer.error(new DOMException('aborted', 'AbortError'))
          return
        }
        observer.next({ data: { runs: [runFor(page)] } })
        observer.complete()
      })
      return () => clearTimeout(answer)
    })
  })

  const { result } = await renderTableRuns({ link }, { strict: true })

  await vi.waitFor(() =>
    expect(result.current.cellsByKey.has(`${PROPOSAL}:1`)).toBe(true)
  )
  expect(started).toHaveLength(2)
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
            serverCell({
              database: PROPOSAL,
              proposal: PROPOSAL,
              run: 1,
              name: 'spectrum',
              value: [1, 2, 3],
              dtype: 'array1d',
            }),
          ],
        },
      ],
    },
  })

  // The fill landed, and the run still carries no flash stamp.
  await vi.waitFor(() =>
    expect(result.current.cellsByKey.get(key)?.spectrum.summary.value).toEqual([
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

test('recovers page-1 heavy cells after a scalar-only cache read', async () => {
  const network = createNetwork()
  const cache = new InMemoryCache({ typePolicies })

  // A summary plot sharing this cache entry has already written page 1 with only
  // a scalar cell, so the hook's first (cache) read shows no heavy cell to defer.
  cache.writeQuery({
    query: TABLE_DATA_QUERY,
    variables: {
      proposal: PROPOSAL,
      page: 1,
      per_page: PAGE_SIZE,
      names: ['run', 'energy'],
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
              id: `${PROPOSAL}:1:energy`,
              name: 'energy',
              error: null,
              summary: { __typename: 'CellSummary', value: 1, dtype: 'number' },
            },
          ],
        },
      ],
    },
  })

  await renderTableRuns(network, { cache })

  // The real lightweight response brings the blanked heavy cell; page 1's
  // deferred pass must still fire despite the scalar-only cache seed.
  await vi.waitFor(() => expect(network.started.deferred).toContain(1))
})
