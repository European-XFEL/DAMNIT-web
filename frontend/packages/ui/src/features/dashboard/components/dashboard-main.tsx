import { lazy, Suspense } from 'react'
import { Box } from '@mantine/core'

import CenteredLoader from '#src/components/feedback/centered-loader'
import { useAppSelector } from '#src/app/store/hooks'
import { selectActiveView } from '#src/features/dashboard/stores/dashboard.selectors'

const PlotContainer = lazy(() => import('#src/features/plots/plot-container'))
const ContextFile = lazy(
  () => import('#src/features/context-file/context-file')
)
const Table = lazy(() => import('#src/features/table/table'))

// Only the active view is mounted. One boundary per view, because a shared one
// hides the table while a plot's chunk loads and the grid then drops right-clicks.
function DashboardMain() {
  const view = useAppSelector(selectActiveView)
  const plot = useAppSelector((state) =>
    view.kind === 'plot' ? state.plots.data[view.id] : undefined
  )

  return (
    <Suspense
      key={view.kind === 'plot' ? view.id : view.kind}
      fallback={<CenteredLoader />}
    >
      {view.kind === 'table' ? (
        <Table />
      ) : view.kind === 'context-file' ? (
        <ContextFile />
      ) : (
        <Box px={20} py={14} flex={1} mih={0} style={{ overflowY: 'auto' }}>
          {plot && <PlotContainer plot={plot} />}
        </Box>
      )}
    </Suspense>
  )
}

export default DashboardMain
