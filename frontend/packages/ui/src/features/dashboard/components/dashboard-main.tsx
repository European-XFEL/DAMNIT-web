import { lazy, Suspense } from 'react'
import { Box } from '@mantine/core'

import { type ContextFileProps } from '#src/features/context-file/context-file'
import { type TableProps } from '#src/features/table/table'
import CenteredLoader from '#src/components/feedback/centered-loader'
import { useAppSelector } from '#src/app/store/hooks'
import { selectActiveView } from '#src/features/dashboard/stores/dashboard.selectors'

const PlotContainer = lazy(() => import('#src/features/plots/plot-container'))
const ContextFile = lazy(
  () => import('#src/features/context-file/context-file')
)
const Table = lazy(() => import('#src/features/table/table'))

type DashboardMainProps = {
  tableProps?: TableProps
  contextFileProps?: ContextFileProps
}

// Only the active view is mounted. One boundary per view, because a shared one
// hides the table while a plot's chunk loads and the grid then drops right-clicks.
function DashboardMain({ tableProps, contextFileProps }: DashboardMainProps) {
  const view = useAppSelector(selectActiveView)

  return (
    <Suspense
      key={view.kind === 'plot' ? view.id : view.kind}
      fallback={<CenteredLoader />}
    >
      {view.kind === 'table' ? (
        <Table {...tableProps} />
      ) : view.kind === 'context-file' ? (
        <ContextFile {...contextFileProps} />
      ) : (
        <Box px={20} py={14} flex={1} mih={0} style={{ overflowY: 'auto' }}>
          <PlotContainer plotId={view.id} />
        </Box>
      )}
    </Suspense>
  )
}

export default DashboardMain
