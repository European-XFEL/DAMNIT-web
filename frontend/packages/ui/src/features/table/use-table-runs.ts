import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApolloClient, useQuery, useReactiveVar } from '@apollo/client/react'
import { debounce } from 'lodash'

import { VARIABLES } from '#src/constants'
import { liveRunStamps } from '#src/data/table/run-stamps'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  DEFERRED_TABLE_DATA_QUERY,
  LIGHTWEIGHT_TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import {
  heavyCellNames,
  indexRunCells,
} from '#src/data/table/table-data.transforms'
import type { Run, RunCells } from '#src/data/table/table-data.types'

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

type Subscription = { unsubscribe: () => void }

// One watched query is the render source: it fetches page 1, and `fetchMore`
// appends the pages the user scrolls to. The field policy dedups every page,
// pushed run, and deferred fill into one normalized run, so the grid reads a
// run's cells by identity from `cellsByKey`. Switching proposals remounts this
// hook (ProposalWrapper is keyed), so the fetched-page bookkeeping resets with
// it.
export function useTableRuns({
  proposal,
  paginated,
  pageSize,
}: UseTableRunsOptions): UseTableRuns {
  const perPage = paginated ? pageSize : ALL_RUNS_PAGE_SIZE
  const client = useApolloClient()
  const fetchedPages = useRef(new Set<number>([1]))
  const deferredPages = useRef(new Set<number>())
  const deferredSubs = useRef(new Map<number, Subscription>())

  const { data, fetchMore } = useQuery<TableDataResult, TableDataVariables>(
    LIGHTWEIGHT_TABLE_DATA_QUERY,
    {
      variables: { proposal, page: 1, per_page: perPage },
      fetchPolicy: 'cache-and-network',
      skip: !proposal,
    }
  )

  const runs = data?.runs

  // Ask for the values @lightweight held back on a page, once. `run` rides along
  // so a deferred row normalizes onto the identity the lightweight pass wrote.
  //
  // Held as a subscription rather than issued through `client.query`, which
  // cannot be cancelled: this fetch carries the heavy values, so one still in
  // flight when the user leaves the proposal would land after the teardown
  // eviction and write those runs, images and all, back into the cache the
  // eviction just reclaimed.
  const fetchDeferred = useCallback(
    (page: number, pageRuns: Run[]) => {
      if (deferredPages.current.has(page)) {
        return
      }
      const heavy = heavyCellNames(pageRuns)
      if (!heavy.length) {
        return
      }
      deferredPages.current.add(page)
      const subscription = client
        .watchQuery<TableDataResult, TableDataVariables>({
          query: DEFERRED_TABLE_DATA_QUERY,
          variables: {
            proposal,
            page,
            per_page: perPage,
            names: [VARIABLES.run, ...heavy],
          },
          fetchPolicy: 'network-only',
        })
        .subscribe({
          next: () => {
            // The result is normalized into the cache by the time this fires and
            // the watched query repaints from it. Unsubscribe to keep the fetch
            // one-shot rather than go on watching. `network-only` never resolves
            // synchronously, so `subscription` is always assigned before this
            // runs; the self-reference is safe.
            deferredSubs.current.delete(page)
            subscription.unsubscribe()
          },
          error: () => {
            // Unmark the page so a later pass can retry it, rather than leaving
            // its heavy cells blank for the rest of the session.
            deferredPages.current.delete(page)
            deferredSubs.current.delete(page)
          },
        })
      deferredSubs.current.set(page, subscription)
    },
    [client, proposal, perPage]
  )

  useEffect(() => {
    const subscriptions = deferredSubs.current
    return () => {
      for (const subscription of subscriptions.values()) {
        subscription.unsubscribe()
      }
      subscriptions.clear()
    }
  }, [])

  // Page 1 arrives on the watched query, so its deferred pass rides its result.
  useEffect(() => {
    if (runs === undefined) {
      return
    }
    fetchDeferred(1, runs)
  }, [runs, fetchDeferred])

  // The grid reports a visible region on every scroll frame, and a page this
  // ever sees is fetched and kept forever. Settling first means dragging the
  // scrollbar across a large table costs a handful of requests rather than one
  // per frame; `maxWait` keeps a continuous slow scroll loading rather than
  // waiting for a pause that never comes. Only the settled region is state:
  // the fetching itself reads a ref, which a render-built closure may not.
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
    if (settledRegion === null) {
      return
    }
    for (const page of pageRangeForRegion(settledRegion, pageSize)) {
      if (fetchedPages.current.has(page)) {
        continue
      }
      // Marked before the request so a later settle does not ask again, and
      // unmarked on failure so the page can be retried instead of staying blank
      // for the rest of the session.
      fetchedPages.current.add(page)
      void fetchMore({ variables: { page } })
        .then((result) => {
          if (result.data) {
            fetchDeferred(page, result.data.runs)
          }
        })
        .catch(() => {
          fetchedPages.current.delete(page)
        })
    }
  }, [settledRegion, pageSize, fetchMore, fetchDeferred])

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

  // Per-run flash stamps for the grid's update highlight, written where the
  // subscription push lands. Loads and deferred fills never stamp, so only a
  // live push animates; a run with no stamp reads undefined and glide skips
  // the flash entirely.
  const lastUpdatedByKey = useReactiveVar(liveRunStamps)

  return { cellsByKey, lastUpdatedByKey, onVisibleRegionChanged }
}
