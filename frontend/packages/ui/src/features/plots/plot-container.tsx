import { useMemo } from 'react'
import { Code, Image, Skeleton, Stack, Text } from '@mantine/core'
import cx from 'clsx'

import { useAppSelector } from '#src/app/store/hooks'
import { ViewStatus } from '#src/components/statuses/view-status'
import { useTableMeta } from '#src/data/table/use-table-meta'
import ComputedItem from '#src/features/plots/components/computed-item'
import UnableToDisplayAlert from '#src/features/plots/components/unable-to-display-alert'
import type { PlotSpec } from '#src/types'

import Plot from './plot'
import classes from './plot.module.css'
import PreviewChunkLoader from './preview-chunk-loader'
import { useSummaryPlotData } from './use-summary-plot-data'
import { usePreviewPlotData } from './use-preview-plot-data'

type PlotContainerProps = {
  plot: PlotSpec
}

function PlotContainer({ plot }: PlotContainerProps) {
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

  const { data: summaryData, computedAt: summaryComputedAt } =
    useSummaryPlotData({
      runIds,
      variables: plot.variables,
      enabled: isSummary,
    })
  const {
    data: previewData,
    chunks,
    computedAt: previewComputedAt,
    outdated,
    reload,
    reloading,
  } = usePreviewPlotData({
    runs: runNumbers,
    variable: plot.variables[0],
    enabled: !isSummary,
  })

  const { traces, meta } = summaryData ?? previewData
  const computedAt = summaryComputedAt ?? previewComputedAt

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
      {computedAt !== null && (
        <ViewStatus>
          <ComputedItem
            time={computedAt}
            outdated={outdated}
            onReload={() => void reload()}
            reloading={reloading}
          />
        </ViewStatus>
      )}
    </Stack>
  )
}

export default PlotContainer
