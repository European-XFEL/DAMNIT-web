import { useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppSelector } from '#src/app/store/hooks'
import { DTYPES, VARIABLES } from '#src/constants'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import { indexRunCells, runKey } from '#src/data/table/table-data.transforms'
import type { RunId } from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'

import type { PlotData, PlotMeta, PlotTrace } from './plots.types'

type UseSummaryPlotDataOptions = {
  runIds: RunId[]
  variables: string[]
  enabled: boolean
}

// Summary plots chart a variable across every run in the proposal. The values
// come from the same normalized cache the table fills (`Query.runs` is keyed by
// database alone, so this shares the table's entry), but the paginated table
// only caches the pages scrolled to, so this pulls the full run set itself
// (per_page = ALL_RUNS_PAGE_SIZE, cache-and-network). cache-first would chart
// only the runs already scrolled into cache, so it stays network-backed; the
// merge policy returning a stable list on value-only pushes is what keeps this
// from re-running on every cache write. A run is charted only when every
// variable it plots is a real number.
export function useSummaryPlotData({
  runIds,
  variables,
  enabled,
}: UseSummaryPlotDataOptions): PlotData | null {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { variables: variableMeta } = useTableMeta()

  const { data } = useQuery<TableDataResult, TableDataVariables>(
    TABLE_DATA_QUERY,
    {
      variables: {
        proposal,
        page: 1,
        per_page: ALL_RUNS_PAGE_SIZE,
        // `run` keys each row; the rest are what the plot charts.
        names: [VARIABLES.run, ...variables],
      },
      fetchPolicy: 'cache-and-network',
      skip: !enabled || !proposal,
    }
  )

  return useMemo(() => {
    if (!enabled) {
      return null
    }

    const cells = indexRunCells(data?.runs ?? [])
    const series = variables.map(() => [] as number[])

    for (const id of runIds) {
      const row = cells.get(runKey(id))
      const points = variables.map((name) => row?.[name])
      const allNumeric = points.every(
        (point) =>
          point != null &&
          typeof point.value === 'number' &&
          point.dtype === DTYPES.number
      )
      if (allNumeric) {
        points.forEach((point, index) => {
          series[index].push(point!.value as number)
        })
      }
    }

    const [xVar, yVar] = variables
    // A variable dropped from the context file leaves the plot that charts it
    // open, with no metadata behind it. Falling back to the name is what the
    // titleless case already does.
    const xName = variableMeta[xVar]?.title || xVar
    const yName = variableMeta[yVar]?.title || yVar

    const trace: PlotTrace = {
      x: { value: series[0], name: xName },
      y: { value: series[1], name: yName },
    }
    const meta: PlotMeta = {
      type: 'scatter',
      x: { name: xName },
      y: { name: yName },
    }

    return { traces: [trace], meta }
  }, [enabled, data, runIds, variables, variableMeta])
}
