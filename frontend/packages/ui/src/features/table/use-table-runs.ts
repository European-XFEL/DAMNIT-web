import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApolloClient, useQuery, useReactiveVar } from '@apollo/client/react'
import { debounce } from 'lodash'

import { VARIABLES } from '#src/constants'
import { liveRunStamps } from '#src/data/table/run-stamps'
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
import { orderBy } from '#src/utils/objects'

import { pageRangeForRegion } from './pagination'
import type { Rectangle } from './types'

type UseTableRunsOptions = {
  proposal: string
  paginated: boolean
  pageSize: number
}

type UseTableRuns = {
  cellsByKey: Map<string, RunCells>
  lastUpdatedByKey: ReadonlyMap<string, number>
  onVisibleRegionChanged: (region: Rectangle) => void
}

// One page's progress through the two passes. `attempts` counts failures only,
// so a scroll-away cancel does not spend the retry budget.
type PageState = {
  lightweight: 'idle' | 'fetching' | 'done'
  // Whether this page's heavy values have landed. Which page is fetching them
  // is not per-page state: one pass runs at a time, so the hook holds that.
  deferred: 'idle' | 'done'
  // Columns this page held back. The request names columns while the server
  // blanks per cell, so one here can be whole on some of the page's runs.
  heavyNames: string[]
  attempts: number
  pageFetch?: AbortController
}

// The one deferred pass in flight. `stop` unsubscribes an Apollo observable,
// not a GraphQL subscription: unsubscribing is what drops the request from the
// priority link's queue, which an abort signal cannot do.
type DeferredFetch = {
  page: number
  stop?: () => void
}

// A deferred pass that keeps failing would hold the only slot on every retry,
// and RetryLink already spends five requests under each attempt.
const MAX_DEFERRED_ATTEMPTS = 3

function pageState(pages: Map<number, PageState>, page: number): PageState {
  return (
    pages.get(page) ?? {
      lightweight: 'idle',
      deferred: 'idle',
      heavyNames: [],
      attempts: 0,
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
    state.deferred === 'idle' &&
    state.heavyNames.length > 0 &&
    state.attempts < MAX_DEFERRED_ATTEMPTS
  )
}

// A page the deferred pass still owes heavy values. One still loading counts: it
// will want the slot within a round trip, and holding it costs the only worker.
function wantsDeferred(state: PageState): boolean {
  return state.lightweight !== 'done' || readyForDeferred(state)
}

// The visible page to load heavy values for next: fewest failures first so a
// refused page lets its neighbours have a turn, then nearest the top.
function nextDeferredPage(
  pages: Map<number, PageState>,
  visible: ReadonlySet<number>
): number | undefined {
  return [...visible]
    .filter((page) => readyForDeferred(pageState(pages, page)))
    .map((page) => ({ page, attempts: pageState(pages, page).attempts }))
    .sort(orderBy(['attempts', 'page'], ['asc', 'asc']))[0]?.page
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

  // Give up the deferred pass in flight. The page keeps its `idle` deferred
  // state, so scrolling back to it asks again.
  const stopDeferred = useCallback(() => {
    deferredFetch.current?.stop?.()
    deferredFetch.current = null
  }, [])

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
      // A pass that brought nothing back is one to try again, so it spends an
      // attempt and hands the slot on rather than retiring the page.
      const failPass = () => {
        updatePage(states, page, {
          attempts: pageState(states, page).attempts + 1,
        })
        release()
        startNext()
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
    [client, proposal, perPage]
  )

  // Ask for the lightweight pass on any of these pages that is neither loading
  // nor loaded. Page 1 comes through here like every other page.
  const ensurePagesLoaded = useCallback(
    (pages: Iterable<number>) => {
      const states = pageStates.current
      for (const page of pages) {
        if (pageState(states, page).lightweight !== 'idle') {
          continue
        }

        // Unmounting cannot reach a query the hook does not hold, so a page
        // fetch is cancelled through the request's abort signal instead.
        const pageFetch = new AbortController()
        updatePage(states, page, { lightweight: 'fetching', pageFetch })
        const variables = { proposal, page, per_page: perPage }
        // Park the page back at idle so scrolling to it asks once more. No
        // attempt cap: RetryLink has already spent five requests under this one.
        const failPageFetch = (...report: unknown[]) => {
          if (pageFetch.signal.aborted) {
            return
          }
          console.error(...report)
          updatePage(states, page, {
            lightweight: 'idle',
            pageFetch: undefined,
          })
        }
        // `no-cache` keeps the answer scoped to this page: a cached read of
        // `Query.runs` hands back every page merged. The write below repaints.
        //
        // Two handlers rather than a trailing `.catch`, so a throw from the
        // success path cannot mark a page that loaded as needing another fetch.
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
          .then(
            ({ data: pageData }) => {
              if (pageFetch.signal.aborted) {
                return
              }
              // A fetch that resolves with no payload is a page that did not
              // load: leave it idle rather than marking it loaded.
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
            },
            (error: Error) => {
              failPageFetch(`Page ${page} failed to load:`, error)
            }
          )
      }
    },
    [client, proposal, perPage, startNextDeferred]
  )

  // Nothing has reported a scroll window yet, so ask for the seeded page. An
  // unpaginated table never reports one, and this is the only ask it gets.
  useEffect(() => {
    if (!proposal) {
      return
    }
    ensurePagesLoaded(visiblePages.current)
  }, [proposal, ensurePagesLoaded])

  // On unmount (a proposal switch) stop both passes: a late deferred fetch
  // lands its images after the teardown eviction, and a page fetch its runs.
  useEffect(() => {
    const pages = pageStates.current
    return () => {
      stopDeferred()
      for (const state of pages.values()) {
        state.pageFetch?.abort()
      }
      pages.clear()
    }
  }, [stopDeferred])

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

    // Scrolling back to a page is the user asking for it again, so it gets its
    // retry budget back. Staying put is not asking, so the same window twice
    // does not re-arm a page the server keeps refusing.
    for (const page of pages) {
      const state = states.get(page)
      if (state && state.attempts > 0 && !visiblePages.current.has(page)) {
        updatePage(states, page, { attempts: 0 })
      }
    }
    visiblePages.current = visible

    // A page fetch nobody is looking at only delays the one the user landed on:
    // this pass is un-throttled, so these compete rather than queue.
    for (const [page, state] of states) {
      if (state.pageFetch && !visible.has(page)) {
        state.pageFetch.abort()
        updatePage(states, page, { lightweight: 'idle', pageFetch: undefined })
      }
    }

    // The page holding the slot has scrolled away. Give it up only if a visible
    // page wants it; with none waiting, that would throw the work away.
    const holder = deferredFetch.current
    if (holder && !visible.has(holder.page)) {
      const wanted = pages.some((page) =>
        wantsDeferred(pageState(states, page))
      )
      if (wanted) {
        stopDeferred()
      }
    }

    ensurePagesLoaded(pages)
    startNextDeferred()
  }, [
    settledRegion,
    proposal,
    pageSize,
    ensurePagesLoaded,
    startNextDeferred,
    stopDeferred,
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

  const cellsByKey = useMemo(() => indexRunCells(runs ?? []), [runs])

  // Per-run flash stamps for the grid's update highlight, stamped only where a
  // live push lands, so loads and deferred fills never animate a row.
  const lastUpdatedByKey = useReactiveVar(liveRunStamps)

  return { cellsByKey, lastUpdatedByKey, onVisibleRegionChanged }
}
