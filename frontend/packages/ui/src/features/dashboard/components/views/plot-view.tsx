import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Box, Text } from '@mantine/core'

import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import CenteredLoader from '#src/components/feedback/centered-loader'
import { useTableMeta } from '#src/data/table/use-table-meta'
import UnableToDisplayAlert from '#src/features/plots/components/unable-to-display-alert'
import {
  findLinkError,
  parsePlotAddress,
  plotAddress,
} from '#src/features/plots/plot-address'
import { addPlot } from '#src/features/plots/plots.slice'
import { plotName } from '#src/features/plots/utils'
import { isEmpty } from '#src/utils/helpers'

const PlotContainer = lazy(() => import('#src/features/plots/plot-container'))

// Draws the plot its address names and lists it in the nav, or says which
// part of the link is wrong, with no nav entry.
function PlotView() {
  const dispatch = useAppDispatch()
  const { kind = '' } = useParams()
  const [searchParams] = useSearchParams()
  const address = useMemo(
    () => parsePlotAddress(kind, searchParams),
    [kind, searchParams]
  )
  const { variables, runs } = useTableMeta()
  const proposal = useAppSelector((state) => state.metadata.proposal.value)

  // Every proposal has the run variable, so none means the metadata is still
  // on its way, and the link cannot be checked yet.
  const loading = isEmpty(variables)
  const error =
    'error' in address
      ? address.error
      : loading
        ? undefined
        : findLinkError(address.plot, {
            variables: Object.keys(variables),
            runs: runs
              .filter((run) => run.proposal === proposal)
              .map((run) => run.run),
          })
  const plot =
    'plot' in address && !loading && error === undefined
      ? address.plot
      : undefined
  const name = plot && plotName(plot, variables)

  useEffect(() => {
    if (plot !== undefined && name !== undefined) {
      dispatch(addPlot({ ...plot, name }))
    }
  }, [plot, name, dispatch])

  if (error === undefined && plot === undefined) {
    return <CenteredLoader />
  }

  return (
    <Suspense fallback={<CenteredLoader />}>
      <Box px={20} py={14} flex={1} mih={0} style={{ overflowY: 'auto' }}>
        {plot !== undefined ? (
          <PlotContainer key={plotAddress(plot)} plot={plot} />
        ) : (
          <UnableToDisplayAlert>
            <Text size="sm">{error}</Text>
          </UnableToDisplayAlert>
        )}
      </Box>
    </Suspense>
  )
}

export default PlotView
