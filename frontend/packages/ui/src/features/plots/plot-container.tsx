import { useMemo, type PropsWithChildren } from 'react'
import { Alert, Code, Image, Skeleton, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

import { useAppSelector } from '#src/app/store/hooks'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { formatRunsSubtitle } from '#src/utils/helpers'

import Plot from './plot'
import PreviewChunkLoader from './preview-chunk-loader'
import { useSummaryPlotData } from './use-summary-plot-data'
import { usePreviewPlotData } from './use-preview-plot-data'

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
  const plot = useAppSelector((state) => state.plots.data[plotId])
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { runs: allRuns } = useTableMeta()

  const isSummary = plot.source === 'summary'

  // The identity pairs this plot charts, in server order. A plot is pinned by
  // run number, which is all the run-selection field can express, so a guest
  // proposal sharing a number would match twice and plot two points where the
  // user asked for one. Restricting to the proposal being viewed picks the one
  // they meant; charting a guest run needs identity all the way down to
  // `extracted_data`, which previews do not have yet.
  const runIds = useMemo(() => {
    if (!plot.runs) {
      return allRuns
    }
    const wanted = new Set(plot.runs)
    return allRuns.filter(
      (run) => run.proposal === proposal && wanted.has(String(run.run))
    )
  }, [plot.runs, allRuns, proposal])

  const runNumbers = useMemo(() => runIds.map((run) => run.run), [runIds])
  const runLabels = useMemo(
    () => runIds.map((run) => String(run.run)),
    [runIds]
  )

  const summaryData = useSummaryPlotData({
    runIds,
    variables: plot.variables,
    enabled: isSummary,
  })
  const { data: previewData, chunks } = usePreviewPlotData({
    runs: runNumbers,
    variable: plot.variables[0],
    enabled: !isSummary,
  })

  const { traces, meta } = summaryData ?? previewData

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
          {formatRunsSubtitle(runLabels)}
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
