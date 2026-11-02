import { useMemo, useState } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppSelector } from '#src/app/store/hooks'
import { VARIABLES } from '#src/constants'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  LIGHTWEIGHT_TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import { indexRunCells } from '#src/data/table/table-data.transforms'

import { type PlotData, type PreviewValue } from './plots.types'
import {
  buildPreviewQuery,
  chunkRuns,
  EMPTY_PREVIEW_QUERY,
  runForAlias,
} from './preview-chunks'
import {
  type ComputedTimeNotes,
  newestNotedTime,
  noteComputedTimes,
  toPlotMeta,
  toPlotTrace,
} from './preview-plot.transforms'

type UsePreviewPlotDataOptions = {
  runs: number[]
  variable: string
  enabled: boolean
}

const NO_DATA: PlotData = { traces: [], meta: { type: 'unsupported' } }
const NO_NOTES: ComputedTimeNotes = { key: '', times: new Map() }

// Reads a preview plot's runs back out of the Apollo cache, and hands back the
// chunks whose loaders fill it. Watching cache-only is what makes the plot fill
// in progressively: each chunk that lands broadcasts to this watcher, so the
// trace list grows instead of waiting on the whole run set. Returning `chunks`
// is a render obligation, the way the table's wanted pages are: nothing fetches
// until the caller renders a PreviewChunkLoader for each one. `computedAt` is
// when the newest data it draws was computed.
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

  const { data } = useQuery<Record<string, PreviewValue | null>>(query, {
    variables: { proposal, variable },
    fetchPolicy: 'cache-only',
    returnPartialData: true,
    skip: !enabled || !proposal || !stableRuns.length,
  })

  const chunks = useMemo(
    () => (enabled ? chunkRuns(stableRuns) : []),
    [enabled, stableRuns]
  )

  // The times come from the table's cells: `extracted_data` carries none. The
  // lightweight pass brings the plotted variable's cells without thumbnails.
  const { data: cellsData } = useQuery<TableDataResult, TableDataVariables>(
    LIGHTWEIGHT_TABLE_DATA_QUERY,
    {
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
      skip: !enabled || !proposal || !stableRuns.length,
    }
  )

  // A chunk still in flight leaves its runs out of the partial result, and a
  // run the backend has no value for comes back null: neither is plotted yet.
  const values = Object.entries(data ?? {})
    .flatMap(([alias, value]) => {
      const run = runForAlias(alias)
      if (run === null || value?.data == null) {
        return []
      }

      return [{ run, value }]
    })
    .sort((first, second) => first.run - second.run)

  // Every run of one variable shares a dtype and dimensions, so any of them
  // settles the plot's type and axes. This is the lowest run cached so far,
  // not the lowest run asked for, so it changes as earlier chunks land: what
  // moves with it is a heatmap's colormap_range, which the backend quantiles
  // per run. Pinning that needs a range over the whole plot, which is a
  // question for whoever wants the colours to hold still.
  const meta = values.length ? toPlotMeta(values[0].value) : null

  // A scatter draws a line per run; an image, a heatmap or a scalar shows its
  // first run alone, so only that run is drawn and dated.
  const drawn = meta?.type === 'scatter' ? values : values.slice(0, 1)

  const cells = indexRunCells(cellsData?.runs ?? [])

  // Notes taken in an earlier render, updated during this one as React allows
  // for state derived from props: an effect would paint a frame without them.
  const [notes, setNotes] = useState(NO_NOTES)
  const nextNotes = noteComputedTimes(notes, {
    proposal,
    variable,
    drawn,
    cells,
  })
  if (nextNotes !== notes) {
    setNotes(nextNotes)
  }

  const computedAt = newestNotedTime(nextNotes, drawn)

  const plotData = meta
    ? {
        traces: drawn.map(({ run, value }) =>
          toPlotTrace(value, { run: String(run) })
        ),
        meta,
      }
    : NO_DATA

  return { data: plotData, chunks, computedAt }
}
