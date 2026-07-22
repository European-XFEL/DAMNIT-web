import { useMemo, type PropsWithChildren } from 'react'
import { Alert, Code, Image, Skeleton, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

import { DTYPES } from '#src/constants'
import { createTypedSelector } from '#src/app/store/selectors'
import { useAppSelector } from '#src/app/store/hooks'
import { type Cell, type Variable } from '#src/data/table/table-data.types'
import { formatRunsSubtitle } from '#src/utils/helpers'

import { type PlotTrace, type PlotMeta, type PlotData } from './plots.types'
import Plot from './plot'
import PreviewChunkLoader from './preview-chunk-loader'
import { useSummaryPlotData } from './use-summary-plot-data'
import { usePreviewPlotData } from './use-preview-plot-data'

/*
 * -----------------------------
 *   Table Data
 * -----------------------------
 */

const selectTableData = createTypedSelector(
  [
    (state) => state.tableData.data,
    (state) => state.tableData.metadata,
    (_, runs) => runs,
    (_, __, variables) => variables,
  ],
  (tableData, tableMetadata, runs: string[], variables: string[]) => {
    const result = variables.reduce<
      Record<string, { data: number[]; metadata: Variable }>
    >((acc, variable) => {
      acc[variable] = {
        data: [],
        metadata: tableMetadata.variables[variable],
      }
      return acc
    }, {})

    for (const run of runs) {
      const varData = variables.map((variable) => tableData[run]?.[variable])

      if (
        varData.every(
          (data): data is Cell =>
            data != null &&
            typeof data.value === 'number' &&
            [DTYPES.number].includes(data.dtype)
        )
      ) {
        variables.forEach((variable, i) => {
          result[variable].data.push(varData[i].value as number)
        })
      }
    }

    return result
  }
)

type UseTableDataOptions = {
  runs: string[]
  variables: string[]
  enabled: boolean
}

const useTableData = (
  { runs, variables, enabled }: UseTableDataOptions = {
    runs: [],
    variables: [],
    enabled: true,
  }
): PlotData | null => {
  const tableData = useAppSelector((state) =>
    selectTableData(state, runs, variables)
  )

  if (!enabled) {
    return null
  }

  const trace: PlotTrace = {}
  const meta: PlotMeta = { type: 'scatter' }
  const [xVar, yVar] = variables

  // A variable dropped from the context file leaves the plot that charts it
  // open, with no metadata behind it. Falling back to the name is what the
  // titleless case already does.
  const xName = tableData[xVar].metadata?.title || xVar
  trace.x = {
    value: tableData[xVar].data,
    name: xName,
  }
  meta.x = { name: xName }

  const yName = tableData[yVar].metadata?.title || yVar
  trace.y = {
    value: tableData[yVar].data,
    name: yName,
  }
  meta.y = { name: yName }

  return { traces: [trace], meta }
}

/*
 * -----------------------------
 *   Other Selectors
 * -----------------------------
 */

const selectRuns = createTypedSelector(
  [
    (state, plotId) => state.plots.data[plotId],
    (state) => state.tableData.metadata.runs,
  ],
  (plot, runsArr) => {
    // Use all runs if `plot.runs` is not defined
    if (!plot?.runs) {
      return runsArr
    }

    // Only get existing runs from `plot.runs`
    const runsSet = new Set(runsArr)
    return plot.runs.filter((run) => runsSet.has(run))
  }
)

/*
 * ------------------------------------
 *   UnableToDisplayAlert Component
 * ------------------------------------
 */

const UnableToDisplayAlert = ({ children }: PropsWithChildren) => {
  return (
    <Alert
      variant="light"
      color="orange"
      title="Unable to display the plot"
      icon={<IconInfoCircle />}
    >
      {children}
    </Alert>
  )
}

/*
 * -----------------------------
 *   PlotContainer Component
 * -----------------------------
 */

type PlotContainerProps = {
  plotId: string
}

const PlotContainer = ({ plotId }: PlotContainerProps) => {
  const runs = useAppSelector((state) => selectRuns(state, plotId))
  const plot = useAppSelector((state) => state.plots.data[plotId])
  const proposal = useAppSelector((state) => state.metadata.proposal.value)

  const isSummary = plot.source === 'summary'
  const runNumbers = useMemo(() => runs.map(Number), [runs])

  useSummaryPlotData({
    variables: plot.variables,
    enabled: isSummary,
  })

  const tableData = useTableData({
    runs,
    variables: plot.variables,
    enabled: isSummary,
  })
  const { data: previewData, chunks } = usePreviewPlotData({
    runs: runNumbers,
    variable: plot.variables[0],
    enabled: !isSummary,
  })

  const { traces, meta } = tableData ?? previewData

  return (
    <Stack align="flex-start" justify="flex-start">
      {chunks.map((chunk) => (
        <PreviewChunkLoader
          key={chunk[0]}
          proposal={proposal}
          runs={chunk}
          variable={plot.variables[0]}
        />
      ))}
      <Stack gap={0} align="flex-start" justify="flex-start">
        <Text size="lg">{plot.title}</Text>
        <Text size="sm" c="dark.5">
          {formatRunsSubtitle(runs)}
        </Text>
      </Stack>
      {!traces.length ? (
        <Skeleton height={430} width={740} radius="xl" />
      ) : meta.type === 'image' ? (
        <Image
          src={traces[0].data?.value}
          h={meta.shape?.[0]}
          w={meta.shape?.[1]}
          fit="contain"
        />
      ) : meta.type === 'scalar' ? (
        <UnableToDisplayAlert>
          <Text size="sm">
            {"The plot can't be displayed because the value is a scalar "}
            <Code>{traces[0].data?.value as string}</Code>.
          </Text>
        </UnableToDisplayAlert>
      ) : meta.type === 'unsupported' ? (
        <UnableToDisplayAlert>
          <Text size="sm">
            {"The plot can't be displayed because the value is unsupported."}
          </Text>
        </UnableToDisplayAlert>
      ) : (
        <Plot traces={traces} meta={meta} />
      )}
    </Stack>
  )
}

export default PlotContainer
