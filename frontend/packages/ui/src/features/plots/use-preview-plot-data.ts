import { useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppSelector } from '#src/app/store/hooks'

import { type PlotData, type PreviewValue } from './plots.types'
import {
  buildPreviewQuery,
  chunkRuns,
  EMPTY_PREVIEW_QUERY,
  runForAlias,
} from './preview-chunks'
import { toPlotMeta, toPlotTrace } from './preview-plot.transforms'

type UsePreviewPlotDataOptions = {
  runs: number[]
  variable: string
  enabled: boolean
}

const NO_DATA: PlotData = { traces: [], meta: { type: 'unsupported' } }

// Reads a preview plot's runs back out of the Apollo cache, and hands back the
// chunks whose loaders fill it. Watching cache-only is what makes the plot fill
// in progressively: each chunk that lands broadcasts to this watcher, so the
// trace list grows instead of waiting on the whole run set. Returning `chunks`
// is a render obligation, the way the table's wanted pages are: nothing fetches
// until the caller renders a PreviewChunkLoader for each one.
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

  const plotData = useMemo(() => {
    if (!data) {
      return NO_DATA
    }

    // A chunk still in flight leaves its runs out of the partial result, and a
    // run the backend has no value for comes back null. Both are simply not
    // plotted yet.
    const values = Object.entries(data)
      .flatMap(([alias, value]) => {
        const run = runForAlias(alias)
        if (run === null || value?.data == null) {
          return []
        }
        return [{ run, value }]
      })
      .sort((first, second) => first.run - second.run)

    if (!values.length) {
      return NO_DATA
    }

    // Every run of one variable shares a dtype and dimensions, so any of them
    // settles the plot's type and axes. This is the lowest run cached so far,
    // not the lowest run asked for, so it changes as earlier chunks land: what
    // moves with it is a heatmap's colormap_range, which the backend quantiles
    // per run. Pinning that needs a range over the whole plot, which is a
    // question for whoever wants the colours to hold still.
    return {
      traces: values.map(({ run, value }) =>
        toPlotTrace(value, { run: String(run) })
      ),
      meta: toPlotMeta(values[0].value),
    }
  }, [data])

  return { data: plotData, chunks }
}
