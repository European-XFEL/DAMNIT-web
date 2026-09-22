import { useMemo, type PropsWithChildren } from 'react'
import { Alert, Code, Image, rem, Skeleton, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import cx from 'clsx'

import { useAppSelector } from '#src/app/store/hooks'
import { useTableMeta } from '#src/data/table/use-table-meta'

import Plot from './plot'
import classes from './plot.module.css'
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
      // Mantine draws the icon in orange.7, 2.73:1 on the tint; orange.8 keeps
      // it over 3:1. The theme already sets the title in the text colour.
      styles={{ icon: { color: 'var(--mantine-color-orange-8)' } }}
      icon={
        <IconInfoCircle
          style={{ width: rem(20), height: rem(20) }}
          stroke={1.5}
          aria-hidden
        />
      }
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
    <Stack align="flex-start" justify="flex-start" maw={1200}>
      {chunks.map((chunk) => (
        <PreviewChunkLoader
          key={chunk[0]}
          proposal={proposal}
          runs={chunk}
          variable={plot.variables[0]}
        />
      ))}
      {!traces.length ? (
        <Skeleton className={cx(classes.frame, classes.wide)} radius="xl" />
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
