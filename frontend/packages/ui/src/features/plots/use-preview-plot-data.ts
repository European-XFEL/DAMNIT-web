import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApolloClient, useQuery, useReactiveVar } from '@apollo/client/react'
import { useDidUpdate } from '@mantine/hooks'
import { sortBy } from 'lodash-es'

import { useAppSelector } from '#src/app/store/hooks'
import { VARIABLES } from '#src/constants'
import { ALL_RUNS_PAGE_SIZE } from '#src/features/plots/runs-truncation'
import {
  LIGHTWEIGHT_TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import { indexRunCells } from '#src/data/table/table-data.transforms'
import { reconnectCount, retryDelay } from '#src/graphql/live-updates'

import type {
  ChunkFailure,
  PlotData,
  PreviewValue,
  SingleRunKind,
} from './plots.types'
import {
  buildPreviewQuery,
  chunkRuns,
  EMPTY_PREVIEW_QUERY,
  runForAlias,
} from './preview-chunks'
import {
  type RecordedTimes,
  newestRecordedTime,
  outdatedRuns,
  recordComputedTimes,
  recordReloadedTimes,
  toPlotMeta,
  toPlotTrace,
} from './preview-plot.transforms'

type UsePreviewPlotDataOptions = {
  runs: number[]
  variable: string
  enabled: boolean
}

const NO_DATA: PlotData = { traces: [], meta: { type: 'unsupported' } }
const NO_RECORDED_TIMES: RecordedTimes = { key: '', times: new Map() }
const NO_FAILED_CHUNKS: ReadonlyMap<string, ChunkFailure> = new Map()
const NO_ATTEMPTS: ReadonlyMap<number, number> = new Map()

// Loading while a chunk is out, failed once every unanswered chunk has failed
// and nothing drew, and ready otherwise.
export type PreviewStatus = 'loading' | 'ready' | 'failed'

// A failed chunk is known by its runs, so one that gains a run is asked for
// anew rather than read as failed.
const chunkId = (runs: number[]) => runs.join(',')

type PreviewChunkData = Record<string, PreviewValue | null>

// The runs a chunk brought back data for. A field that failed comes back null.
function answeredRuns(data: PreviewChunkData | undefined) {
  return Object.entries(data ?? {}).flatMap(([alias, value]) => {
    const run = runForAlias(alias)
    return run !== null && value != null ? [{ run, alias, value }] : []
  })
}

// Reads a preview plot's runs back out of the Apollo cache, and hands back the
// chunks whose loaders fill it. Watching cache-only is what makes the plot fill
// in progressively: each chunk that lands broadcasts to this watcher, so the
// trace list grows instead of waiting on the whole run set. Returning `chunks`
// is a render obligation, the way the table's wanted pages are: nothing fetches
// until the caller renders a PreviewChunkLoader for each one, under the chunk's
// `key` and reporting to `markChunkFailed`. `computedAt` is when the newest
// data it draws was computed, and `outdated` the drawn runs computed again
// since, which `reload` fetches anew.
export function usePreviewPlotData({
  runs,
  variable,
  enabled,
}: UsePreviewPlotDataOptions) {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)

  // The run set arrives with a fresh array reference on every live push, even
  // when its contents have not changed. Rebuilding it from a content key keeps
  // the reference steady until the runs actually change, which is what stops
  // each push from rebuilding the document and refetching chunks the cache
  // already holds.
  const runsKey = runs.join(',')
  const stableRuns = useMemo(
    () => (runsKey ? runsKey.split(',').map(Number) : []),
    [runsKey]
  )

  // A summary plot calls this hook disabled, over every run in the proposal.
  // Building that document costs a megabyte of string and a quarter second for
  // a query `skip` guarantees will never be sent.
  const query = useMemo(
    () => (enabled ? buildPreviewQuery(stableRuns) : EMPTY_PREVIEW_QUERY),
    [enabled, stableRuns]
  )

  const skip = !enabled || !proposal || !stableRuns.length
  const { data } = useQuery<PreviewChunkData>(query, {
    variables: { proposal, variable },
    fetchPolicy: 'cache-only',
    returnPartialData: true,
    skip,
  })

  const chunkRunSets = useMemo(
    () => (enabled ? chunkRuns(stableRuns) : []),
    [enabled, stableRuns]
  )

  const [failedChunks, setFailedChunks] = useState(NO_FAILED_CHUNKS)
  // How often each chunk, by its first run, was asked for again. It is part of
  // its loader's key, so a new attempt mounts a new loader.
  const [attempts, setAttempts] = useState(NO_ATTEMPTS)

  const markChunkFailed = useCallback(
    (runs: number[], failure: ChunkFailure) => {
      const id = chunkId(runs)
      setFailedChunks((current) =>
        current.get(id) === failure
          ? current
          : new Map(current).set(id, failure)
      )
    },
    []
  )

  // Failed chunks clear even when none is in the plot any more, so the retry
  // clock below stops.
  const retryFailedChunks = useCallback(() => {
    const retried = chunkRunSets.filter((runs) =>
      failedChunks.has(chunkId(runs))
    )
    setFailedChunks(NO_FAILED_CHUNKS)
    if (!retried.length) {
      return
    }

    setAttempts((current) => {
      const next = new Map(current)
      for (const [first] of retried) {
        next.set(first, (next.get(first) ?? 0) + 1)
      }

      return next
    })
  }, [chunkRunSets, failedChunks])

  // Only a network failure, such as a 5xx while live updates stay up, retries
  // on their clock. Rounds never reset: a chunk that answered keeps its data.
  const [retryRounds, setRetryRounds] = useState(0)
  const networkFailed = [...failedChunks.values()].includes('network')
  useEffect(() => {
    if (!networkFailed) {
      return
    }

    const timer = setTimeout(() => {
      setRetryRounds((rounds) => rounds + 1)
      retryFailedChunks()
    }, retryDelay(retryRounds))

    return () => clearTimeout(timer)
  }, [networkFailed, retryRounds, retryFailedChunks])

  const chunks = chunkRunSets.map((runs) => ({
    key: `${runs[0]}:${attempts.get(runs[0]) ?? 0}`,
    runs,
  }))

  // The times come from the table's cells: `extracted_data` carries none. The
  // lightweight pass brings the plotted variable's cells without thumbnails.
  const { data: cellsData, refetch: refetchCells } = useQuery<
    TableDataResult,
    TableDataVariables
  >(LIGHTWEIGHT_TABLE_DATA_QUERY, {
    variables: {
      proposal,
      page: 1,
      per_page: ALL_RUNS_PAGE_SIZE,
      names: [VARIABLES.run, variable],
    },
    fetchPolicy: 'cache-and-network',
    // A refetch overwrites by default, cutting every cached run down to this
    // one cell: the table and run panel lose every other value.
    refetchWritePolicy: 'merge',
    // A reload after a reconnect must not join a request sent before it, which
    // may have read the database before the server's catch-up cursor.
    context: { queryDeduplication: false },
    skip,
  })

  // A run computed again while live updates were down tints the plot too. The
  // chunks that loaded are not fetched again, since Reload does that; the ones
  // that failed are.
  const reconnects = useReactiveVar(reconnectCount)
  useDidUpdate(() => {
    retryFailedChunks()
    if (skip) {
      return
    }

    refetchCells().catch((error: unknown) => {
      console.error("The preview plot's times failed to reload:", error)
    })
  }, [reconnects])

  // A chunk still in flight leaves its runs out of the partial result, a failed
  // run comes back null and a run with no value has null data: none is drawn.
  const cached = Object.entries(data ?? {}).flatMap(([alias, value]) => {
    const run = runForAlias(alias)
    if (run === null || value?.data == null) {
      return []
    }

    return [{ run, value }]
  })
  const values = sortBy(cached, (entry) => entry.run)

  // Every run of one variable shares a dtype and dimensions, so any of them
  // settles the plot's type and axes. This is the lowest run cached so far,
  // not the lowest run asked for, so it changes as earlier chunks land: what
  // moves with it is a heatmap's colormap_range, which the backend quantiles
  // per run. Pinning that needs a range over the whole plot, which is a
  // question for whoever wants the colours to hold still.
  const meta = values.length ? toPlotMeta(values[0].value) : null

  // A line plot draws a line per run; an image, a heatmap or a scalar shows
  // its first run alone, so only that run is drawn and dated.
  const drawn = meta?.type === 'line' ? values : values.slice(0, 1)

  // A null field is one that raised, and its chunk's loader reports it failed.
  const answered = new Set(answeredRuns(data).map(({ run }) => run))
  const unanswered = chunkRunSets.filter((runs) =>
    runs.some((run) => !answered.has(run))
  )
  const unansweredFailed = unanswered.filter((runs) =>
    failedChunks.has(chunkId(runs))
  )
  const status: PreviewStatus =
    unansweredFailed.length < unanswered.length
      ? 'loading'
      : unansweredFailed.length && !drawn.length
        ? 'failed'
        : 'ready'

  // An image or a heatmap leaves out its other runs with data.
  const hiddenCount = values.length - drawn.length
  const kind: SingleRunKind | null =
    meta?.type === 'image' || meta?.type === 'heatmap' ? meta.type : null
  const singleRun =
    kind && hiddenCount > 0 ? { kind, run: drawn[0].run, hiddenCount } : null

  const cells = indexRunCells(cellsData?.runs ?? [])

  // Times recorded in an earlier render, updated during this one as React allows
  // for state derived from props: an effect would paint a frame without them.
  const [recorded, setRecorded] = useState(NO_RECORDED_TIMES)
  const nextRecorded = recordComputedTimes(recorded, {
    proposal,
    variable,
    drawn,
    cells,
  })
  if (nextRecorded !== recorded) {
    setRecorded(nextRecorded)
  }

  const computedAt = newestRecordedTime(nextRecorded, drawn)
  const outdated = outdatedRuns(nextRecorded, {
    proposal,
    variable,
    drawn,
    cells,
  })

  const client = useApolloClient()
  const [reloading, setReloading] = useState(false)

  const reload = async () => {
    setReloading(true)

    const variables = { proposal, variable }

    // Written by hand, since Apollo would store a failed field as null and the
    // plot would drop a run it still has data for.
    const reloadChunk = async (chunk: number[]) => {
      const { data, errors } = await client.query<PreviewChunkData>({
        query: buildPreviewQuery(chunk),
        variables,
        fetchPolicy: 'no-cache',
        errorPolicy: 'all',
        // A loader's first request may still be out, from before the run was
        // computed again.
        context: { queryDeduplication: false },
      })
      if (errors?.length) {
        console.error("A preview plot's runs failed to reload:", errors)
      }

      const answered = answeredRuns(data)
      if (!answered.length) {
        return
      }

      const query = buildPreviewQuery(answered.map(({ run }) => run))
      client.writeQuery({
        query,
        variables,
        data: Object.fromEntries(
          answered.map(({ alias, value }) => [alias, value])
        ),
      })

      // Equal data leaves the object the cache holds, and the plot draws that
      // one, so the time is recorded against what reads back.
      const stored = client.readQuery<PreviewChunkData>({ query, variables })
      const reloaded = answered.flatMap(({ run, alias }) => {
        const value = stored?.[alias]
        return value ? [{ run, value }] : []
      })
      setRecorded((current) =>
        recordReloadedTimes(current, {
          proposal,
          variable,
          reloaded,
          cellsAtPress: cells,
        })
      )
    }

    const results = await Promise.allSettled(
      chunkRuns(outdated).map(reloadChunk)
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error("A preview plot's data failed to reload:", result.reason)
      }
    }

    setReloading(false)
  }

  const plotData = meta
    ? {
        traces: drawn.map(({ run, value }) =>
          toPlotTrace(value, { run: String(run) })
        ),
        meta,
      }
    : NO_DATA

  return {
    data: plotData,
    status,
    chunks,
    markChunkFailed,
    retryFailedChunks,
    singleRun,
    computedAt,
    outdated,
    reload,
    reloading,
  }
}
