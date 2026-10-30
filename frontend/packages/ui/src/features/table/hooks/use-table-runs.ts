import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApolloClient, useQuery, useReactiveVar } from '@apollo/client/react'
import { debounce, isEqual } from 'lodash'

import { VARIABLES } from '#src/constants'
import { liveRunStamps } from '#src/data/table/run-stamps'
import { warnIfRunsTruncated } from '#src/data/table/runs-truncation'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  CACHED_RUNS_QUERY,
  DEFERRED_TABLE_DATA_QUERY,
  LIGHTWEIGHT_TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import {
  heavyCellNames,
  indexRunCells,
} from '#src/data/table/table-data.transforms'
import type { RunCells } from '#src/data/table/table-data.types'
import { reconnectCount, retryDelay } from '#src/graphql/live-updates'
import { sorted } from '#src/utils/array'
import { pageRangeForRegion } from '#src/features/table/utils/pagination'
import type {
  LoadErrors,
  Rectangle,
} from '#src/features/table/types/table.types'

type UseTableRunsOptions = {
  proposal: string
  paginated: boolean
  pageSize: number
}

type UseTableRuns = {
  cellsByKey: Map<string, RunCells>
  lastUpdatedByKey: ReadonlyMap<string, number>
  onVisibleRegionChanged: (region: Rectangle) => void
  loadErrors: LoadErrors
  // Asks again now for the failed pages in view, unless a try is already out.
  retryNow: () => void
}

const NO_LOAD_ERRORS: LoadErrors = {
  rows: [],
  values: [],
  waitsForRetry: false,
}

// One page's progress through the two passes. A failed pass waits for the
// retry clock, then reads `retrying` until it lands or fails again.
type PageState = {
  lightweight: 'idle' | 'fetching' | 'done' | 'failed' | 'retrying'
  // Whether this page's heavy values have landed. Which page is fetching them
  // is not per-page state: one pass runs at a time, so the hook holds that.
  deferred: 'idle' | 'done' | 'failed' | 'retrying'
  // Columns this page held back. The request names columns while the server
  // blanks per cell, so one here can be whole on some of the page's runs.
  heavyNames: string[]
  pageFetch?: AbortController
}

// The one deferred pass in flight. `stop` unsubscribes an Apollo observable,
// not a GraphQL subscription: unsubscribing is what drops the request from the
// priority link's queue, which an abort signal cannot do.
type DeferredFetch = {
  page: number
  stop?: () => void
}

function pageState(pages: Map<number, PageState>, page: number): PageState {
  return (
    pages.get(page) ?? {
      lightweight: 'idle',
      deferred: 'idle',
      heavyNames: [],
    }
  )
}

// Entries are replaced rather than mutated, so a callback that fires after a
// teardown cannot write through a handle the map no longer holds.
function updatePage(
  pages: Map<number, PageState>,
  page: number,
  changes: Partial<PageState>
): void {
  pages.set(page, { ...pageState(pages, page), ...changes })
}

// A page whose deferred pass can go out now. One that held nothing back has
// nothing to fetch: the padded window reaches past the last run.
function readyForDeferred(state: PageState): boolean {
  return (
    state.lightweight === 'done' &&
    (state.deferred === 'idle' || state.deferred === 'retrying') &&
    state.heavyNames.length > 0
  )
}

// A page the deferred pass still owes heavy values. One still loading counts: it
// will want the slot within a round trip. One waiting for the clock does not.
function wantsDeferred(state: PageState): boolean {
  return (
    (state.lightweight !== 'done' && state.lightweight !== 'failed') ||
    readyForDeferred(state)
  )
}

// The visible page to load heavy values for next: a first turn before a retry,
// so a failing page lets its neighbours go first, then nearest the top.
function nextDeferredPage(
  pages: Map<number, PageState>,
  visible: ReadonlySet<number>
): number | undefined {
  const ready = sorted([...visible]).filter((page) =>
    readyForDeferred(pageState(pages, page))
  )
  return (
    ready.find((page) => pageState(pages, page).deferred === 'idle') ?? ready[0]
  )
}

function waitsForRetry(state: PageState): boolean {
  return state.lightweight === 'failed' || state.deferred === 'failed'
}

// Whether this pass has failed and not landed since.
function failedPass(pass: PageState['lightweight' | 'deferred']): boolean {
  return pass === 'failed' || pass === 'retrying'
}

function loadErrorsInView(
  pages: Map<number, PageState>,
  { visible, perPage }: { visible: ReadonlySet<number>; perPage: number }
): LoadErrors {
  const inView = sorted([...visible]).map((page) => ({
    rows: { first: (page - 1) * perPage, last: page * perPage - 1 },
    state: pageState(pages, page),
  }))
  const rowsWhere = (failed: (state: PageState) => boolean) =>
    inView.filter(({ state }) => failed(state)).map(({ rows }) => rows)

  return {
    rows: rowsWhere((state) => failedPass(state.lightweight)),
    values: rowsWhere((state) => failedPass(state.deferred)),
    waitsForRetry: inView.some(({ state }) => waitsForRetry(state)),
  }
}

// The cache is the render source: every page, deferred fill and pushed run
// merges into one normalized run there, and this hook only reads it and asks
// for the pages the user is looking at. Switching proposals remounts the hook
// (ProposalWrapper is keyed), so the page bookkeeping resets with it. Each app
// fixes `paginated` and `pageSize`, so nothing else changes the page size.
export function useTableRuns({
  proposal,
  paginated,
  pageSize,
}: UseTableRunsOptions): UseTableRuns {
  const perPage = paginated ? pageSize : ALL_RUNS_PAGE_SIZE
  const client = useApolloClient()

  const pageStates = useRef(new Map<number, PageState>())
  // Seeded to page 1: the grid reports no region until it has laid out, and an
  // unpaginated table never reports one at all.
  const visiblePages = useRef(new Set([1]))
  const deferredFetch = useRef<DeferredFetch | null>(null)
  // One retry clock for the table, as live updates keep one: its wait doubles
  // with each try, and starts over once no page in view has failed.
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()
  const retries = useRef(0)
  // The clock calls back into the passes that start it, so it reaches the
  // retry through a ref rather than a dependency.
  const retryFailedRef = useRef(() => {})
  // The page states are refs, so this is what renders when they fail.
  const [loadErrors, setLoadErrors] = useState(NO_LOAD_ERRORS)

  // Reads what the passes have written; `cache-only` so it never fetches a page
  // of its own. Partial reads still repaint, so a page lands as it arrives.
  const { data } = useQuery<TableDataResult, TableDataVariables>(
    CACHED_RUNS_QUERY,
    {
      variables: { proposal },
      fetchPolicy: 'cache-only',
      returnPartialData: true,
      skip: !proposal,
    }
  )

  const runs = data?.runs

  // Give up the deferred pass in flight. The page is not marked done, so
  // scrolling back to it asks again.
  const stopDeferred = useCallback(() => {
    deferredFetch.current?.stop?.()
    deferredFetch.current = null
  }, [])

  // Only frees the slot for a page in view that wants it: with none waiting,
  // stopping would throw the work away.
  const stopDeferredOutOfView = useCallback(() => {
    const holder = deferredFetch.current
    const visible = visiblePages.current
    if (!holder || visible.has(holder.page)) {
      return
    }

    const wanted = [...visible].some((page) =>
      wantsDeferred(pageState(pageStates.current, page))
    )
    if (wanted) {
      stopDeferred()
    }
  }, [stopDeferred])

  // Cancel the clock's wait. Its count of tries stays, so the waits keep
  // growing while a retry is still out.
  const stopRetryClock = useCallback(() => {
    clearTimeout(retryTimer.current)
    retryTimer.current = undefined
  }, [])

  // Show the failed pages in view, and run the clock while one waits. A retried
  // pass still counts as failed, so its waits grow until it lands.
  const updateFailedPages = useCallback(() => {
    const errors = loadErrorsInView(pageStates.current, {
      visible: visiblePages.current,
      perPage,
    })
    // Kept while equal, so a page that lands does not repaint the table.
    setLoadErrors((current) => (isEqual(current, errors) ? current : errors))

    if (errors.rows.length === 0 && errors.values.length === 0) {
      retries.current = 0
    }
    if (!errors.waitsForRetry) {
      stopRetryClock()
      return
    }
    if (retryTimer.current === undefined) {
      // Up to 1 s of spread, so the open tabs do not all retry at once.
      retryTimer.current = setTimeout(
        () => retryFailedRef.current(),
        retryDelay(retries.current) + Math.random() * 1000
      )
    }
  }, [perPage, stopRetryClock])

  // Fetch the values `@lightweight` held back on the page that most needs them.
  // One pass runs at a time, and this hook picks which page rather than the
  // priority link: only the hook knows what the user is looking at.
  const startNextDeferred = useCallback(
    // Named so a settled pass can start the next one.
    function startNext() {
      if (deferredFetch.current) {
        return
      }
      const states = pageStates.current
      const page = nextDeferredPage(states, visiblePages.current)
      if (page === undefined) {
        return
      }

      // Claimed before subscribing: an emission arriving first would otherwise
      // release a slot not yet taken, and its successor be overwritten below.
      const inFlight: DeferredFetch = { page }
      deferredFetch.current = inFlight
      const release = () => {
        if (deferredFetch.current === inFlight) {
          deferredFetch.current = null
        }
      }
      // A pass that brought nothing back waits for the clock and hands the slot
      // on. Out of view, the page forgets the failure, as a scroll away does.
      const failPass = () => {
        updatePage(states, page, {
          deferred: visiblePages.current.has(page) ? 'failed' : 'idle',
        })
        release()
        startNext()
        updateFailedPages()
      }

      // `run` rides along so a deferred row normalizes onto the identity the
      // lightweight pass wrote.
      const names = [VARIABLES.run, ...pageState(states, page).heavyNames]
      const variables = { proposal, page, per_page: perPage, names }
      // `no-cache` keeps the answer scoped to this page: a cached read of
      // `Query.runs` hands back every page merged. The write below repaints.
      const subscription = client
        .watchQuery<TableDataResult, TableDataVariables>({
          query: DEFERRED_TABLE_DATA_QUERY,
          variables,
          fetchPolicy: 'no-cache',
          // A stopped pass lets go of its request a tick later, and until then
          // deduplication would hand it, and its stale answer, to a new pass.
          context: { queryDeduplication: false },
        })
        .subscribe({
          next: ({ data: pageData }) => {
            // One answer is all this asks for, so stop watching. `no-cache`
            // reads nothing back, so this handle is set before any emission.
            subscription.unsubscribe()
            if (!pageData) {
              console.error(
                `Heavy values for page ${page} came back with no data`
              )
              failPass()
              return
            }
            client.cache.writeQuery({
              query: DEFERRED_TABLE_DATA_QUERY,
              variables,
              data: pageData,
            })
            updatePage(states, page, { deferred: 'done' })
            release()
            startNext()
            updateFailedPages()
          },
          error: (error) => {
            console.error(
              `Heavy values for page ${page} failed to load:`,
              error
            )
            failPass()
          },
        })
      inFlight.stop = () => subscription.unsubscribe()
    },
    [client, proposal, perPage, updateFailedPages]
  )

  // A page that failed reads `retrying` until it answers, so the clock knows
  // the failure has not cleared.
  const fetchPage = useCallback(
    (page: number) => {
      const states = pageStates.current

      // Unmounting cannot reach a query the hook does not hold, so a page
      // fetch is cancelled through the request's abort signal instead.
      const pageFetch = new AbortController()
      updatePage(states, page, {
        lightweight:
          pageState(states, page).lightweight === 'failed'
            ? 'retrying'
            : 'fetching',
        pageFetch,
      })
      const variables = { proposal, page, per_page: perPage }

      // A failed page waits for the clock rather than the next scroll: RetryLink
      // has already spent five requests under this one.
      const failPageFetch = (...report: unknown[]) => {
        if (pageFetch.signal.aborted) {
          return
        }

        console.error(...report)
        updatePage(states, page, {
          lightweight: 'failed',
          pageFetch: undefined,
        })
        updateFailedPages()
      }

      // `no-cache` keeps the answer scoped to this page: a cached read of
      // `Query.runs` hands back every page merged. The write below repaints.
      void client
        .query<TableDataResult, TableDataVariables>({
          query: LIGHTWEIGHT_TABLE_DATA_QUERY,
          variables,
          fetchPolicy: 'no-cache',
          // Deduplication would hand a re-issued page the first request's
          // signal, which a remount has already aborted.
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: pageFetch.signal },
          },
        })
        // Two handlers rather than a trailing `.catch`, so a throw from the
        // success path cannot mark a page that loaded as needing another fetch.
        .then(
          ({ data: pageData }) => {
            if (pageFetch.signal.aborted) {
              return
            }

            // A fetch that resolves with no payload is a page that did not
            // load: mark it failed rather than loaded.
            if (!pageData) {
              failPageFetch(`Page ${page} came back with no data`)
              return
            }

            client.cache.writeQuery({
              query: LIGHTWEIGHT_TABLE_DATA_QUERY,
              variables,
              data: pageData,
            })
            updatePage(states, page, {
              lightweight: 'done',
              pageFetch: undefined,
              heavyNames: heavyCellNames(pageData.runs),
            })
            startNextDeferred()
            updateFailedPages()
          },
          (error: Error) => {
            failPageFetch(`Page ${page} failed to load:`, error)
          }
        )
    },
    [client, proposal, perPage, startNextDeferred, updateFailedPages]
  )

  // Ask for the lightweight pass on any of these pages not asked for yet.
  // Page 1 comes through here like any other; a failed one waits for the clock.
  const ensurePagesLoaded = useCallback(
    (pages: Iterable<number>) => {
      for (const page of pages) {
        if (pageState(pageStates.current, page).lightweight === 'idle') {
          fetchPage(page)
        }
      }
    },
    [fetchPage]
  )

  // Called during a try, a retry would ask nothing and still grow the waits.
  const retryFailed = useCallback(() => {
    const states = pageStates.current
    const waiting = [...visiblePages.current].some((page) =>
      waitsForRetry(pageState(states, page))
    )
    if (!waiting) {
      return
    }

    stopRetryClock()
    retries.current += 1
    for (const page of visiblePages.current) {
      const state = pageState(states, page)
      if (state.lightweight === 'failed') {
        fetchPage(page)
      }
      if (state.deferred === 'failed') {
        updatePage(states, page, { deferred: 'retrying' })
      }
    }
    stopDeferredOutOfView()
    startNextDeferred()
    // Nothing waits now, which the run count shows while the try is out.
    updateFailedPages()
  }, [
    fetchPage,
    startNextDeferred,
    stopDeferredOutOfView,
    stopRetryClock,
    updateFailedPages,
  ])

  useEffect(() => {
    retryFailedRef.current = retryFailed
  }, [retryFailed])

  // Load the pages in view on mount, since an unpaginated table never reports
  // a scroll window, and again on a reconnect, which may have missed changes.
  const reconnects = useReactiveVar(reconnectCount)
  useEffect(() => {
    if (proposal) {
      ensurePagesLoaded(visiblePages.current)
    }
    // Stop both passes: a late deferred fetch lands its images after the
    // teardown eviction, and a page fetch its runs.
    const pages = pageStates.current
    return () => {
      stopDeferred()
      for (const state of pages.values()) {
        state.pageFetch?.abort()
      }
      pages.clear()
      updateFailedPages()
    }
  }, [proposal, ensurePagesLoaded, stopDeferred, updateFailedPages, reconnects])

  // Settling the per-frame scroll reports turns a scrollbar drag into a handful
  // of requests; `maxWait` keeps a slow scroll loading with no pause to wait for.
  const [settledRegion, setSettledRegion] = useState<Rectangle | null>(null)
  const settleRegion = useMemo(
    () => debounce(setSettledRegion, 150, { maxWait: 500 }),
    []
  )

  useEffect(() => {
    return () => {
      settleRegion.cancel()
    }
  }, [settleRegion])

  useEffect(() => {
    // The proposal is empty on the render before its metadata lands, and the
    // grid can report a window during it.
    if (settledRegion === null || !proposal) {
      return
    }
    const pages = pageRangeForRegion(settledRegion, pageSize)
    const visible = new Set(pages)
    const states = pageStates.current

    for (const [page, state] of states) {
      if (visible.has(page)) {
        continue
      }

      // A page out of view forgets its failures: scrolling back to it is the
      // user asking again, so it asks at once rather than on the clock.
      if (state.lightweight === 'failed') {
        updatePage(states, page, { lightweight: 'idle' })
      }
      if (state.deferred === 'failed' || state.deferred === 'retrying') {
        updatePage(states, page, { deferred: 'idle' })
      }

      // A page fetch nobody is looking at only delays the one the user landed
      // on: this pass is un-throttled, so these compete rather than queue.
      if (state.pageFetch) {
        state.pageFetch.abort()
        updatePage(states, page, { lightweight: 'idle', pageFetch: undefined })
      }
    }
    visiblePages.current = visible

    stopDeferredOutOfView()
    ensurePagesLoaded(pages)
    startNextDeferred()
    updateFailedPages()
  }, [
    settledRegion,
    proposal,
    pageSize,
    ensurePagesLoaded,
    startNextDeferred,
    stopDeferredOutOfView,
    updateFailedPages,
  ])

  const onVisibleRegionChanged = useCallback(
    (region: Rectangle) => {
      if (!paginated) {
        return
      }
      // The grid reports a zero-size region before it has laid out; treat it as
      // no window rather than fetching page 1 twice.
      if (region.width === 0 || region.height === 0) {
        return
      }
      settleRegion(region)
    },
    [paginated, settleRegion]
  )

  // The unpaginated table pulls every run in one page, so a full page back means
  // runs past the cap are missing.
  const runCount = runs?.length
  useEffect(() => {
    if (paginated || runCount === undefined) {
      return
    }
    warnIfRunsTruncated(proposal, runCount)
  }, [paginated, proposal, runCount])

  const cellsByKey = useMemo(() => indexRunCells(runs ?? []), [runs])

  // Per-run flash stamps for the grid's update highlight, stamped only where a
  // live push lands, so loads and deferred fills never animate a row.
  const lastUpdatedByKey = useReactiveVar(liveRunStamps)

  return {
    cellsByKey,
    lastUpdatedByKey,
    onVisibleRegionChanged,
    loadErrors,
    retryNow: retryFailed,
  }
}
