import { useMemo, useState } from 'react'
import { Code, Image, Skeleton, Stack, Text } from '@mantine/core'
import cx from 'clsx'

import { useAppSelector } from '#src/app/store/hooks'
import { ViewStatus } from '#src/components/statuses/view-status'
import { useTableMeta } from '#src/data/table/use-table-meta'
import ComputedItem from '#src/features/plots/components/computed-item'
import FailedPlotAlert from '#src/features/plots/components/failed-plot-alert'
import UnableToDisplayAlert from '#src/components/feedback/unable-to-display-alert'
import type { PlotSpec } from '#src/types'

import Plot from './plot'
import classes from './plot.module.css'
import PreviewChunkLoader from './preview-chunk-loader'
import { useSummaryPlotData } from './use-summary-plot-data'
import { usePreviewPlotData } from './use-preview-plot-data'
import { plotRunIds } from './utils'

type PlotContainerProps = {
  plot: PlotSpec
}

function PlotContainer({ plot }: PlotContainerProps) {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { runs: allRuns } = useTableMeta()

  const isSummary = plot.source === 'summary'

  const runIds = useMemo(
    () => plotRunIds(allRuns, { proposal, selection: plot.runs }),
    [plot.runs, allRuns, proposal]
  )

  const runNumbers = useMemo(() => runIds.map((run) => run.run), [runIds])

  const { data: summaryData, computedAt: summaryComputedAt } =
    useSummaryPlotData({
      runIds,
      variables: plot.variables,
      enabled: isSummary,
    })
  const {
    data: previewData,
    status,
    chunks,
    markChunkFailed,
    retryFailedChunks,
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

  // A retry keeps the failed alert up until its data draws or fails again, so
  // the view does not flicker and Try again keeps its focus.
  const [showsFailed, setShowsFailed] = useState(false)
  if (status === 'failed' && !showsFailed) {
    setShowsFailed(true)
  }
  if (status === 'ready' && showsFailed) {
    setShowsFailed(false)
  }
  const retrying = showsFailed && status === 'loading'

  return (
    <Stack align="flex-start" justify="flex-start" maw={1200}>
      {chunks.map(({ key, runs }) => (
        <PreviewChunkLoader
          key={key}
          proposal={proposal}
          runs={runs}
          variable={plot.variables[0]}
          onFailed={markChunkFailed}
        />
      ))}
      {!traces.length && showsFailed ? (
        <FailedPlotAlert retrying={retrying} onRetry={retryFailedChunks} />
      ) : !traces.length && status === 'loading' ? (
        <Skeleton className={cx(classes.frame, classes.wide)} radius="xl" />
      ) : !traces.length ? (
        <UnableToDisplayAlert title="Unable to display the plot">
          <Text size="sm">None of its runs has data that can be plotted.</Text>
        </UnableToDisplayAlert>
      ) : meta.type === 'image' ? (
        <Image
          src={traces[0].data?.value}
          h={meta.shape?.[0]}
          w={meta.shape?.[1]}
          fit="contain"
        />
      ) : meta.type === 'scalar' ? (
        <UnableToDisplayAlert title="Unable to display the plot">
          <Text size="sm">
            {"The plot can't be displayed because the value is a scalar "}
            <Code>{traces[0].data?.value as string}</Code>.
          </Text>
        </UnableToDisplayAlert>
      ) : meta.type === 'unsupported' ? (
        <UnableToDisplayAlert title="Unable to display the plot">
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
