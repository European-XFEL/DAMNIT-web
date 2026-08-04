import { useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppSelector } from '#src/app/store/hooks'
import { DTYPES, VARIABLES } from '#src/constants'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import { warnIfRunsTruncated } from '#src/data/table/runs-truncation'
import {
  getTitleByName,
  hasValue,
  indexRunCells,
  runKey,
} from '#src/data/table/table-data.transforms'
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

  const runs = data?.runs

  // This path pulls the whole proposal in one page, so a full page back means
  // runs past the cap are missing from every summary plot.
  const runCount = runs?.length
  useEffect(() => {
    if (runCount !== undefined) {
      warnIfRunsTruncated(proposal, runCount)
    }
  }, [proposal, runCount])

  const cells = useMemo(() => indexRunCells(runs ?? []), [runs])

  return useMemo(() => {
    if (!enabled) {
      return null
    }

    const series = variables.map(() => [] as number[])

    for (const id of runIds) {
      const row = cells.get(runKey(id))
      const points = variables.map((name) => row?.[name])
      const allNumeric = points.every(
        (point) =>
          hasValue(point) &&
          typeof point.summary.value === 'number' &&
          point.summary.dtype === DTYPES.number
      )
      if (allNumeric) {
        points.forEach((point, index) => {
          series[index].push(point!.summary.value as number)
        })
      }
    }

    const [xVar, yVar] = variables
    const xName = getTitleByName(variableMeta, xVar)
    const yName = getTitleByName(variableMeta, yVar)

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
  }, [enabled, cells, runIds, variables, variableMeta])
}
