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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  TABLE_DATA_QUERY_NAME,
} from '#src/graphql/operation-names'
import { liveRunStamps, stampLiveRuns } from '#src/data/table/run-stamps'
import { TABLE_DATA_QUERY } from '#src/data/table/table-data.queries'
import { countReconnect } from '#src/graphql/live-updates'
import { createPriorityLink } from '#src/graphql/priority-link'
import { typePolicies } from '#src/graphql/type-policies'
import { useTableRuns } from '#src/features/table/hooks/use-table-runs'
import type { Rectangle } from '#src/features/table/types/table.types'
import type { RunCells } from '#src/data/table/table-data.types'
import { sorted } from '#src/utils/array'
import { serverCell } from '#tests/support/cells'

const PROPOSAL = '900405'
const PAGE_SIZE = 10
const LIGHTWEIGHT_NAME = `Lightweight${TABLE_DATA_QUERY_NAME}`

// The stamp store is module state shared across tests: reset it so one test's
// push cannot flash a later test's runs.
afterEach(() => {
  liveRunStamps(new Map())
  vi.restoreAllMocks()
  vi.useRealTimers()
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
// past merely in flight. `failLightweight` refuses the page reads instead.
function createNetwork({
  answerDeferred = false,
  failDeferred = false,
  failLightweight = false,
} = {}) {
  const started = { lightweight: [] as number[], deferred: [] as number[] }
  const cancelled = { deferred: [] as number[] }

  const link = new ApolloLink((operation) => {
    const page = (operation.variables.page as number) ?? 1
    if (operation.operationName === LIGHTWEIGHT_NAME) {
      started.lightweight.push(page)
      if (network.failLightweight) {
        return refuses('the server cannot answer this page')
      }
      return answers([runFor(page)])
    }
    started.deferred.push(page)
    if (network.failDeferred) {
      return refuses('the server cannot answer this page')
    }
    if (answerDeferred) {
      return answers([filledRunFor(page)])
    }
    return hangsUntilCancelled(() => cancelled.deferred.push(page))
  })

  // A test turns a `fail` flag off to bring the server back, or on to take it
  // down after the first page has loaded.
  const network = { link, started, cancelled, failDeferred, failLightweight }
  return network
}

// Page reads stay out until the test fails them, oldest first, so a test can
// hold a retry out while it looks. Heavy values never arrive.
function createHeldNetwork() {
  const started: number[] = []
  const open = new Map<number, Array<() => void>>()

  const link = new ApolloLink((operation) => {
    if (operation.operationName !== LIGHTWEIGHT_NAME) {
      return hangs()
    }

    const page = (operation.variables.page as number) ?? 1
    started.push(page)

    return new Observable<FetchResult>((observer) => {
      const failures = open.get(page) ?? []
      failures.push(() => observer.error(new Error('the server gave up')))
      open.set(page, failures)
    })
  })

  const fail = (page: number) => open.get(page)?.shift()?.()

  return { link, started, fail }
}

const heavyValueFor = (cells: Map<string, RunCells>, run: number): unknown =>
  cells.get(`${PROPOSAL}:${run}`)?.get('spectrum')?.summary.value

const timesStarted = (started: number[], page: number) =>
  started.filter((startedPage) => startedPage === page).length

// Long enough for the scroll window to settle, on the real clock or a fake one.
const settle = async () => {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(200)
    return
  }
  await new Promise((resolve) => setTimeout(resolve, 200))
}

// The retry clock's waits come out exact, with none of the spread that keeps
// open tabs from retrying together. `Date` too, for the scroll debounce.
const fakeRetryClock = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.spyOn(Math, 'random').mockReturnValue(0)
}

async function renderTableRuns(
  network: { link: ApolloLink },
  {
    strict = false,
    paginated = true,
    priorityLink = true,
    cache = new InMemoryCache({ typePolicies }),
  }: {
    strict?: boolean
    // Off for the demo's table, which loads every run as one page.
    paginated?: boolean
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
        paginated,
        pageSize: PAGE_SIZE,
      }),
    { wrapper: Providers }
  )
  return { ...view, client }
}

describe('scrolling the table', () => {
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

    // Dragging the scrollbar: the grid reports a region on every frame, and
    // each one names a different band of pages.
    for (let y = 0; y < 500; y += 10) {
      result.current.onVisibleRegionChanged({ x: 0, y, width: 100, height: 20 })
    }

    await vi.waitFor(() => expect(pages.length).toBeGreaterThan(0))
    // Fetching per frame would ask for every page the drag passed over, and
    // none of those requests can be cancelled once made.
    expect(pages.length).toBeLessThan(10)
  })

  test('asks for a page still loading only once when the window settles on it', async () => {
    const started: number[] = []

    // Page 1 never answers, so it is still loading when the window settles.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName !== LIGHTWEIGHT_NAME) {
        return hangs()
      }

      started.push(page)
      return page === 1 ? hangs() : answers([runFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toContain(1))

    result.current.onVisibleRegionChanged(regionAt(0))

    // Page 3 being asked for shows the settled window reached the fetch.
    await vi.waitFor(() => expect(started).toContain(3))
    expect(timesStarted(started, 1)).toBe(1)
  })

  test('aborts a page fetch when its page scrolls out of the window', async () => {
    const aborted: number[] = []

    // Page 1 answers at once; every scrolled page hangs, so its fetch is still
    // in flight when the next scroll moves the window off it.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName !== LIGHTWEIGHT_NAME) {
        return hangs()
      }
      if (page === 1) {
        return answers([runFor(page)])
      }
      return new Observable((observer) => {
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

  test("cancels a page's in-flight deferred fetch when it scrolls out of view", async () => {
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

  test('leaves an in-flight deferred fetch alone when the pages scrolled to are already loaded', async () => {
    const started: number[] = []
    const cancelled: number[] = []

    // Page 1's heavy values never arrive; every other page's do, so a scroll
    // can land on a window that needs nothing.
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

    // Scroll away while page 1 is in flight: the pages landed on still need the
    // slot, so page 1 gives it up.
    await vi.waitFor(() => expect(started).toContain(1))
    result.current.onVisibleRegionChanged(regionAt(200))
    await vi.waitFor(() => expect(cancelled).toEqual([1]))

    // Back to the top, which re-issues page 1 and fills pages 2 and 3.
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
    expect(timesStarted(started, 1)).toBe(2)

    // Away again, but every page landed on is filled by now. Tearing page 1
    // down would free a slot nobody is waiting for and throw its work away.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()

    expect(cancelled).toEqual([1])
  })

  test('leaves an in-flight deferred fetch alone when the visible pages hold nothing back', async () => {
    const started = { lightweight: [] as number[], deferred: [] as number[] }
    const cancelled: number[] = []

    // Page 1 holds a heavy value back and its deferred pass never answers.
    // Every other page is scalar-only, so it loads with nothing to defer.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        started.lightweight.push(page)
        return answers([page === 1 ? runFor(page) : scalarRunFor(page)])
      }
      started.deferred.push(page)
      return hangsUntilCancelled(() => cancelled.push(page))
    })

    const { result } = await renderTableRuns({ link })

    // Scroll away before those pages have loaded: what they hold back is not
    // known yet, so page 1 gives up the slot.
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
    expect(timesStarted(started.deferred, 1)).toBe(2)

    // Away again. Those pages are loaded and hold nothing back, so tearing
    // page 1 down would free a slot nobody is waiting for.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()

    expect(cancelled).toEqual([1])
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
      expect(timesStarted(network.started.deferred, 1)).toBe(2)
    )
  })

  test("does not re-issue a scrolled-away page's deferred pass when a later page lands", async () => {
    const started: number[] = []

    // Page 1 never answers, so it is still cancellable after the scroll. The
    // others answer and free the slot, so a re-issue would reach the link.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        return answers([runFor(page)])
      }
      started.push(page)
      if (page === 1) {
        return hangs()
      }
      return answers([filledRunFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toContain(1))

    // Scroll far past page 1, cancelling it. The pages landed on then fill, and
    // each of those cache writes is what used to re-fire page 1.
    result.current.onVisibleRegionChanged(regionAt(200))
    await vi.waitFor(() => expect(started).toContain(20))
    await settle()

    expect(timesStarted(started, 1)).toBe(1)
  })

  test('does not fetch heavy values for a page the user has already scrolled past', async () => {
    const started: number[] = []
    const pending: Array<() => void> = []

    // Every page but the first holds its rows until the test releases them, so
    // a fetch can resolve after the user has scrolled elsewhere.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        if (page === 1) {
          return answers([runFor(page)])
        }
        return new Observable((observer) => {
          pending.push(() => {
            observer.next({ data: { runs: [runFor(page)] } })
            observer.complete()
          })
        })
      }
      started.push(page)
      return answers([filledRunFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toContain(1))

    // Ask for pages 20 to 23, then return to the top before any of them answer.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()

    pending.forEach((answer) => answer())
    await settle()

    // Pages 2 and 3 are on screen and get their heavy values; page 20 resolved
    // into a window nobody is looking at and must not spend the throttle slot.
    expect(started).toContain(2)
    expect(started).toContain(3)
    expect(started).not.toContain(20)
  })
})

describe('waiting for the heavy values to fill in', () => {
  test('does not re-request a page whose deferred pass already finished', async () => {
    const network = createNetwork({ answerDeferred: true })
    const { result } = await renderTableRuns(network)

    // Wait for the value, not the request: an in-flight page is also skipped,
    // so waiting on the request would pass with no record of finished pages.
    await vi.waitFor(() =>
      expect(heavyValueFor(result.current.cellsByKey, 1)).toEqual([1, 2, 3])
    )

    // Settle on a window spanning pages 1 to 3: the two new pages load, and
    // page 1 comes back into view having already been filled.
    result.current.onVisibleRegionChanged(regionAt(0))

    await vi.waitFor(() => expect(network.started.deferred).toContain(3))
    // Asking again would re-download every heavy value on the page.
    expect(timesStarted(network.started.deferred, 1)).toBe(1)
  })

  test('asks for a heavy column that first appears on a later page', async () => {
    const deferredNames: Record<number, string[]> = {}

    // Page 1 holds back only `spectrum`. Later pages hold back `preview` too,
    // the way a variable added to the context file mid-session shows up.
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
        return answers([page === 1 ? runFor(page) : runWithNewColumn(page)])
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

    // Only page 20 holds back `preview`; its neighbours hold back `spectrum`
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
        return answers([page === 20 ? runWithPreview(page) : runFor(page)])
      }
      deferredNames[page] = operation.variables.names as string[]
      return answers([filledRunFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(deferredNames[1]).toBeDefined())

    // Scrolling to y 200 loads pages 20, 21 and 22; page 20 is scanned first.
    result.current.onVisibleRegionChanged(regionAt(200))
    await vi.waitFor(() => expect(deferredNames[21]).toBeDefined())

    expect(deferredNames[20]).toContain('preview')
    expect(deferredNames[21]).toContain('spectrum')
    expect(deferredNames[21]).not.toContain('preview')
  })

  test("asks for one page's heavy values at a time", async () => {
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

  test('does not fetch heavy values for a page that held nothing back', async () => {
    const started = { lightweight: [] as number[], deferred: [] as number[] }

    // The proposal's runs stop at page 21, so the tail of the padded window
    // comes back empty. Scrolling to y 200 asks for pages 20 through 23.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        started.lightweight.push(page)
        return answers(page > 21 ? [] : [runFor(page)])
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

    // Settle on it again, which takes the cached-page path rather than the
    // fetch path, and must reach the same answer.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()

    expect(started.deferred).not.toContain(22)
  })

  test('recovers page-1 heavy cells after a scalar-only cache read', async () => {
    const network = createNetwork()
    const cache = new InMemoryCache({ typePolicies })

    // A summary plot sharing this cache entry already wrote page 1 with only a
    // scalar cell, so the hook's first (cache) read has no heavy cell to defer.
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
                computed_at: null,
                summary: {
                  __typename: 'CellSummary',
                  value: 1,
                  dtype: 'number',
                },
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
})

describe('running into a page that fails to load', () => {
  beforeEach(fakeRetryClock)

  test('reports a page that fails to load and asks for it again a second later, with no scroll', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started.lightweight).toEqual([1]))

    // The server goes down, and the user scrolls to pages it cannot answer.
    network.failLightweight = true
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()
    expect(reported).toHaveBeenCalled()
    expect(timesStarted(network.started.lightweight, 20)).toBe(1)

    // The user sits still.
    await vi.advanceTimersByTimeAsync(1000)

    expect(timesStarted(network.started.lightweight, 20)).toBe(2)
  })

  test('asks for a page again when its fetch brings no payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    await settle()
    expect(timesStarted(started, 20)).toBe(1)

    // A page marked loaded with nothing in it is never asked for again.
    await vi.advanceTimersByTimeAsync(1000)

    expect(timesStarted(started, 20)).toBe(2)
  })

  test('waits twice as long after each failure, up to 30 s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const tries: number[] = []

    const link = new ApolloLink((operation) => {
      if (operation.operationName !== LIGHTWEIGHT_NAME) {
        return hangs()
      }
      tries.push(Date.now())
      return refuses('the server cannot answer this page')
    })

    await renderTableRuns({ link })
    await vi.advanceTimersByTimeAsync(100_000)

    const waits = tries.slice(1).map((time, index) => time - tries[index])
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
  })

  test('waits a second again once the failed pages have loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const started: number[] = []
    let serverDown = true
    let dropPage3 = () => {}

    // Page 2 fails while the server is down. Page 3's first request stays open
    // until the test drops it, so it can fail after page 2 loads, with no scroll.
    const link = new ApolloLink((operation) => {
      if (operation.operationName !== LIGHTWEIGHT_NAME) {
        return hangs()
      }
      const page = (operation.variables.page as number) ?? 1
      started.push(page)
      if (page === 2 && serverDown) {
        return refuses('the server cannot answer this page')
      }
      if (page === 3 && timesStarted(started, 3) === 1) {
        return new Observable((observer) => {
          dropPage3 = () => observer.error(new Error('the server gave up'))
        })
      }
      return answers([runFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()

    // Page 2 fails five times, so the next wait is 16 s. Then the server comes
    // back and page 2 loads, while page 3's request is still out.
    await vi.advanceTimersByTimeAsync(15_000)
    expect(timesStarted(started, 2)).toBe(5)
    serverDown = false
    await vi.advanceTimersByTimeAsync(16_000)
    expect(timesStarted(started, 2)).toBe(6)

    // Page 3's request fails, and the user sits still.
    dropPage3()
    await vi.advanceTimersByTimeAsync(1000)

    expect(timesStarted(started, 3)).toBe(2)
  })

  test('keeps the waits growing when other pages load while a retry is out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const started: number[] = []
    const loadPage: Array<() => void> = []
    let failRetry = () => {}

    // Page 1's heavy values fail at once, then its retry fails when the test
    // says. Pages 2 and 3 hold nothing back and load when the test says.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        if (page === 1) {
          return answers([runFor(page)])
        }
        return new Observable((observer) => {
          loadPage.push(() => {
            observer.next({ data: { runs: [scalarRunFor(page)] } })
            observer.complete()
          })
        })
      }
      started.push(page)
      if (started.length === 1) {
        return refuses('the server cannot answer this page')
      }
      return new Observable((observer) => {
        failRetry = () => observer.error(new Error('the server gave up'))
      })
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toEqual([1]))
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()

    // The retry goes out, and pages 2 and 3 land before it fails.
    await vi.advanceTimersByTimeAsync(1000)
    expect(started).toEqual([1, 1])
    loadPage.forEach((load) => load())
    await vi.waitFor(() =>
      expect(result.current.cellsByKey.has(`${PROPOSAL}:3`)).toBe(true)
    )
    failRetry()

    // The second wait is 2 s, as if nothing had landed.
    await vi.advanceTimersByTimeAsync(1999)
    expect(started).toEqual([1, 1])
    await vi.advanceTimersByTimeAsync(1)
    expect(started).toEqual([1, 1, 1])
  })

  test('asks for a failed page at once when it scrolls back into view, and not while it is away', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started.lightweight).toEqual([1]))

    // Page 20 fails, then the user scrolls back to the top and stays there.
    network.failLightweight = true
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(timesStarted(network.started.lightweight, 20)).toBe(1)

    // Back to page 20, sooner than any wait on the clock.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()

    expect(timesStarted(network.started.lightweight, 20)).toBe(2)
  })

  test('retries failed heavy values on the clock, after the pages beside them have had the slot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const started: number[] = []

    // Page 2's heavy values always fail, and page 3's take 2 s, so the clock
    // asks for page 2 again while page 3 holds the slot and page 4 waits.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        return answers([runFor(page)])
      }
      started.push(page)
      if (page === 2) {
        return refuses('the server cannot answer this page')
      }
      if (page === 3) {
        return new Observable((observer) => {
          setTimeout(() => {
            observer.next({ data: { runs: [filledRunFor(page)] } })
            observer.complete()
          }, 2000)
        })
      }
      return answers([filledRunFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toEqual([1]))

    // Settle on pages 2 to 4.
    result.current.onVisibleRegionChanged(regionAt(15))
    await settle()
    expect(started).toEqual([1, 2, 3])

    await vi.advanceTimersByTimeAsync(2000)

    expect(started).toEqual([1, 2, 3, 4, 2])
  })

  test('leaves the slot to a page scrolled away until the clock asks again for the page in view that failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cancelled: number[] = []
    let serverDown = true

    // Page 1's heavy values never arrive, so it holds the slot. Page 3 fails to
    // load while the server is down, and pages 2 and 4 hold nothing back.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName !== LIGHTWEIGHT_NAME) {
        if (page === 1) {
          return hangsUntilCancelled(() => cancelled.push(page))
        }
        return answers([filledRunFor(page)])
      }
      if (page === 3 && serverDown) {
        return refuses('the server cannot answer this page')
      }
      return answers([
        page === 2 || page === 4 ? scalarRunFor(page) : runFor(page),
      ])
    })

    const { result } = await renderTableRuns({ link })

    // Pages 1 to 4, then 2 to 4. Page 3 cannot use the slot before the clock
    // asks for it again, so page 1 keeps it.
    result.current.onVisibleRegionChanged(regionAt(10))
    await settle()
    result.current.onVisibleRegionChanged(regionAt(15))
    await settle()
    expect(cancelled).toEqual([])

    // The server comes back, and the clock asks for page 3 again.
    serverDown = false
    await vi.advanceTimersByTimeAsync(1000)

    expect(cancelled).toEqual([1])
  })

  test('takes the slot from a page scrolled away when the clock asks again for heavy values in view', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const started: number[] = []
    const cancelled: number[] = []

    // Page 3's heavy values fail, and page 4's never arrive, so page 4 holds
    // the slot once it has it. Every other page answers.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        return answers([runFor(page)])
      }
      started.push(page)
      if (page === 3) {
        return refuses('the server cannot answer this page')
      }
      if (page === 4) {
        return hangsUntilCancelled(() => cancelled.push(page))
      }
      return answers([filledRunFor(page)])
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toEqual([1]))

    // Pages 1 to 3, then 3 to 5: page 3 fails, and page 4 takes the slot.
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
    result.current.onVisibleRegionChanged(regionAt(25))
    await settle()
    expect(started).toEqual([1, 2, 3, 4])

    // Back up to pages 1 to 3, and the clock asks for page 3 again.
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
    await vi.advanceTimersByTimeAsync(1000)

    expect(cancelled).toEqual([4])
    expect(started).toEqual([1, 2, 3, 4, 3])
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
    await vi.waitFor(() => expect(started).toEqual([1]))

    // A page that brought nothing back is not done, so its heavy cells must
    // not stay blank for the session.
    await vi.advanceTimersByTimeAsync(1000)

    expect(started).toEqual([1, 1])
  })

  test('asks a page for its heavy values at once when it scrolls back into view after they failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ failDeferred: true })
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started.deferred).toEqual([1]))

    // Away, long enough for the clock to have retried many times, and back.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(timesStarted(network.started.deferred, 1)).toBe(1)
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()

    expect(timesStarted(network.started.deferred, 1)).toBe(2)
  })

  test('asks a page for its heavy values at once when they failed after it scrolled away', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const started: number[] = []
    let failPageOne = () => {}

    // Page 1 holds a heavy value back, and its pass waits for the test to fail
    // it. Every other page is scalar-only, so a window over them wants no slot.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        return answers([page === 1 ? runFor(page) : scalarRunFor(page)])
      }
      started.push(page)
      return new Observable((observer) => {
        failPageOne = () => observer.error(new Error('the server gave up'))
      })
    })

    const { result } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toEqual([1]))

    // Away and back, so the pages at y 200 are loaded and hold nothing back.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()
    expect(started).toEqual([1, 1])

    // Away again: page 1 keeps the slot, and its pass fails out of view.
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()
    failPageOne()

    // Back to the top, sooner than any wait on the clock.
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()

    expect(started).toEqual([1, 1, 1])
  })

  test("asks for the demo table's one page again, though it never scrolls", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ failLightweight: true })
    const { result } = await renderTableRuns(network, { paginated: false })
    expect(timesStarted(network.started.lightweight, 1)).toBe(1)

    // The server comes back.
    network.failLightweight = false
    await vi.advanceTimersByTimeAsync(1000)

    await vi.waitFor(() =>
      expect(result.current.cellsByKey.has(`${PROPOSAL}:1`)).toBe(true)
    )
  })

  test('says which rows failed to load, and that they wait for the clock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ failLightweight: true })
    const { result } = await renderTableRuns(network)

    await vi.waitFor(() =>
      expect(result.current.loadErrors).toEqual({
        rows: [{ first: 0, last: 9 }],
        values: [],
        waitsForRetry: true,
      })
    )
  })

  test('says which rows failed when only their heavy values did', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ failDeferred: true })
    const { result } = await renderTableRuns(network)

    await vi.waitFor(() =>
      expect(result.current.loadErrors).toEqual({
        rows: [],
        values: [{ first: 0, last: 9 }],
        waitsForRetry: true,
      })
    )
  })

  test('stops waiting for the clock while its retry is out, and waits again once that fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createHeldNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started).toEqual([1]))
    network.fail(1)
    await vi.waitFor(() =>
      expect(result.current.loadErrors.waitsForRetry).toBe(true)
    )

    // The clock asks again.
    await vi.advanceTimersByTimeAsync(1000)
    expect(network.started).toEqual([1, 1])
    expect(result.current.loadErrors).toEqual({
      rows: [{ first: 0, last: 9 }],
      values: [],
      waitsForRetry: false,
    })

    // The retry fails too.
    network.fail(1)

    await vi.waitFor(() =>
      expect(result.current.loadErrors.waitsForRetry).toBe(true)
    )
  })

  test('waits for the clock again when a page fails while another is being retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createHeldNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started).toEqual([1]))
    network.fail(1)
    result.current.onVisibleRegionChanged(regionAt(0))
    await settle()

    // The clock asks for page 1 again, while page 2 is still loading.
    await vi.advanceTimersByTimeAsync(1000)
    expect(result.current.loadErrors.waitsForRetry).toBe(false)

    // Page 2 fails.
    network.fail(2)

    await vi.waitFor(() =>
      expect(result.current.loadErrors).toEqual({
        rows: [
          { first: 0, last: 9 },
          { first: 10, last: 19 },
        ],
        values: [],
        waitsForRetry: true,
      })
    )
  })

  test('says nothing about a failed page once it scrolls out of view', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ failLightweight: true })
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() =>
      expect(result.current.loadErrors.rows).toEqual([{ first: 0, last: 9 }])
    )

    // The server comes back, and the user scrolls far down.
    network.failLightweight = false
    result.current.onVisibleRegionChanged(regionAt(200))
    await settle()

    await vi.waitFor(() =>
      expect(result.current.loadErrors).toEqual({
        rows: [],
        values: [],
        waitsForRetry: false,
      })
    )
  })

  test('Try again asks for a page waiting on the clock at once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createHeldNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started).toEqual([1]))
    network.fail(1)
    await vi.waitFor(() =>
      expect(result.current.loadErrors.waitsForRetry).toBe(true)
    )

    // No time passes, which `vi.waitFor` would let the clock's own retry use.
    result.current.retryNow()
    await vi.advanceTimersByTimeAsync(0)

    expect(network.started).toEqual([1, 1])
  })

  test('Try again during a try asks for nothing and keeps the next wait as it was', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createHeldNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started).toEqual([1]))
    network.fail(1)

    // The clock's retry is out when the user presses.
    await vi.advanceTimersByTimeAsync(1000)
    expect(network.started).toEqual([1, 1])
    result.current.retryNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(network.started).toEqual([1, 1])

    // The retry fails, and the second wait is still 2 s.
    network.fail(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(network.started).toEqual([1, 1])
    await vi.advanceTimersByTimeAsync(1)

    expect(network.started).toEqual([1, 1, 1])
  })

  test('asks for nothing more once the table unmounts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ failLightweight: true })
    const { unmount } = await renderTableRuns(network)

    // The clock is running.
    await vi.advanceTimersByTimeAsync(1000)
    expect(timesStarted(network.started.lightweight, 1)).toBe(2)

    await unmount()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(timesStarted(network.started.lightweight, 1)).toBe(2)
  })
})

describe('leaving and reopening the table', () => {
  test('cancels in-flight deferred fetches when the hook unmounts', async () => {
    const network = createNetwork()
    const { unmount } = await renderTableRuns(network)

    await vi.waitFor(() => expect(network.started.deferred).toContain(1))

    // A proposal switch remounts the hook. In-flight heavy pages must let go,
    // or they land after the eviction and write the old proposal's runs back.
    await unmount()

    await vi.waitFor(() => expect(network.cancelled.deferred).toEqual([1]))
  })

  test('does not fetch heavy values for a page whose fetch resolves after teardown', async () => {
    const started: number[] = []
    const pending: Array<() => void> = []

    // A scrolled page's rows wait for the test and ignore the abort. An abort
    // cannot reject an answer that has arrived, which is the race tested here.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        if (page === 1) {
          return answers([runFor(page)])
        }
        return new Observable((observer) => {
          pending.push(() => {
            observer.next({ data: { runs: [runFor(page)] } })
            observer.complete()
          })
        })
      }
      started.push(page)
      return hangs()
    })

    const { result, unmount } = await renderTableRuns({ link })
    await vi.waitFor(() => expect(started).toContain(1))

    // Scroll so a page fetch goes out, then leave the proposal before it lands.
    result.current.onVisibleRegionChanged(regionAt(200))
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0))
    await unmount()

    // The page lands after the teardown eviction. It must not start a heavy
    // request for the proposal the user has left, which nothing can now cancel.
    pending.forEach((answer) => answer())
    await settle()

    expect(started).toEqual([1])
  })

  test('aborts an in-flight page fetch when the hook unmounts', async () => {
    const started = { lightweight: [] as number[], deferred: [] as number[] }
    const aborted: number[] = []

    // A scrolled page's fetch hangs until aborted. Unmounting cannot reach a
    // query the hook does not hold, so only the abort can stop it.
    const link = new ApolloLink((operation) => {
      const page = (operation.variables.page as number) ?? 1
      if (operation.operationName === LIGHTWEIGHT_NAME) {
        started.lightweight.push(page)
        if (page === 1) {
          return answers([runFor(page)])
        }
        return new Observable((observer) => {
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
    await vi.waitFor(() =>
      expect(started.lightweight.length).toBeGreaterThan(1)
    )

    await unmount()

    // The aborted request never resolves, so it cannot write the old proposal's
    // runs back into the swept cache or start a deferred pass for them.
    await vi.waitFor(() => expect(aborted.length).toBeGreaterThan(0))
    expect(started.deferred).toEqual([1])
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
      if (page === 1) {
        return answers([runFor(page)])
      }
      return new Observable((observer) => {
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

  test("records a scrolled page's deferred pass after a StrictMode remount", async () => {
    // StrictMode's cleanup between its two mount setups stops every fetch and
    // drops the page bookkeeping, so the second setup must re-issue page 1.
    const network = createNetwork()
    const { result } = await renderTableRuns(network, { strict: true })

    await vi.waitFor(() => expect(network.started.deferred).toContain(1))

    // Scroll past page 1 so the landed page's fetchMore goes out and resolves.
    result.current.onVisibleRegionChanged(regionAt(200))

    await vi.waitFor(() => expect(network.started.deferred).toContain(20))
  })

  test('loads page 1 again when a StrictMode remount aborts the first attempt', async () => {
    const started: number[] = []

    // Answers on a later task and honours the abort, as a network and
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
})

describe('receiving a live update', () => {
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
      data: { runs: [filledRunFor(1)] },
    })

    // The fill landed, and the run still carries no flash stamp.
    await vi.waitFor(() =>
      expect(heavyValueFor(result.current.cellsByKey, 1)).toEqual([1, 2, 3])
    )
    expect(result.current.lastUpdatedByKey.get(key)).toBeUndefined()
  })

  test('flashes a pushed run in the grid frame clock', async () => {
    const network = createNetwork()
    const { result } = await renderTableRuns(network)
    const key = `${PROPOSAL}:1`

    // Stamp the way the subscription push handler does when a push arrives.
    stampLiveRuns([{ proposal: PROPOSAL, run: 1 }])

    // Glide fades the flash on its performance.now() clock: a Date.now() stamp
    // reads as decades ahead there and paints the row yellow forever.
    await vi.waitFor(() =>
      expect(result.current.lastUpdatedByKey.get(key)).toBeGreaterThan(0)
    )
    expect(result.current.lastUpdatedByKey.get(key)).toBeLessThanOrEqual(
      performance.now()
    )
  })
})

describe('reconnecting after an outage', () => {
  test('asks again for the pages in view, and only those', async () => {
    const network = createNetwork({ answerDeferred: true })
    const { result } = await renderTableRuns(network)

    // Load pages 20 to 23, then settle back on pages 1 to 3.
    result.current.onVisibleRegionChanged(regionAt(200))
    await vi.waitFor(() => expect(network.started.deferred).toContain(23))
    result.current.onVisibleRegionChanged(regionAt(0))
    await vi.waitFor(() => expect(network.started.deferred).toContain(3))
    network.started.lightweight.length = 0

    countReconnect()

    // Every page in view may hold values that changed during the gap, loaded
    // or not. The pages scrolled past load again when the user returns.
    await vi.waitFor(() => expect(network.started.lightweight).toHaveLength(3))
    await settle()
    expect(sorted(network.started.lightweight)).toEqual([1, 2, 3])
  })

  test('stops the deferred pass in flight and starts it again on the reloaded page', async () => {
    const network = createNetwork()
    await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started.deferred).toEqual([1]))

    countReconnect()

    // Its answer could predate the reconnect and miss the very changes the
    // reload is for.
    await vi.waitFor(() => expect(network.started.deferred).toEqual([1, 1]))
    expect(network.cancelled.deferred).toEqual([1])
  })

  test('pages scrolled to after a reconnect mid-load still get their heavy values', async () => {
    const network = createNetwork()
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() => expect(network.started.deferred).toEqual([1]))

    // Reconnect while page 1's heavy values are loading
    countReconnect()
    await vi.waitFor(() => expect(network.started.lightweight).toEqual([1, 1]))

    // Scroll away from page 1
    result.current.onVisibleRegionChanged(regionAt(200))
    await vi.waitFor(() => expect(network.started.deferred).toContain(20))
  })

  test('loads the heavy values that failed during the outage without waiting out the clock', async () => {
    fakeRetryClock()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = createNetwork({ answerDeferred: true, failDeferred: true })

    // Page 1 fails five times while the server is down, so its next try is
    // 16 s away
    const { result } = await renderTableRuns(network)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(timesStarted(network.started.deferred, 1)).toBe(5)
    expect(heavyValueFor(result.current.cellsByKey, 1)).toBeNull()

    // The server is back and live updates reconnect
    network.failDeferred = false
    countReconnect()

    await vi.waitFor(() =>
      expect(heavyValueFor(result.current.cellsByKey, 1)).toEqual([1, 2, 3])
    )
  })

  test('a table opened after an earlier reconnect asks for page 1 only once', async () => {
    countReconnect()
    const network = createNetwork()

    // Opening a plot and going back remounts the table long after the
    // reconnect. Resetting then would abort the page it has just asked for.
    const { result } = await renderTableRuns(network)
    await vi.waitFor(() =>
      expect(result.current.cellsByKey.has(`${PROPOSAL}:1`)).toBe(true)
    )

    expect(network.started.lightweight).toEqual([1])
  })
})
