import { lazy, Suspense } from 'react'

import { type ContextFileProps } from '../context-file'
import { type TableProps } from '../table'

import { CenteredLoader } from '../../components/feedback'
import { useAppSelector } from '../../redux/hooks'

const PlotsTab = lazy(() =>
  import('../plots').then((module) => ({ default: module.PlotsTab }))
)
const ContextFile = lazy(() =>
  import('../context-file').then((module) => ({
    default: module.ContextFile,
  }))
)
const Table = lazy(() => import('../table'))

type DashBoardMainProps = {
  tableProps?: TableProps
  contextFileProps?: ContextFileProps
}

function DashboardMain({ tableProps, contextFileProps }: DashBoardMainProps) {
  const main = useAppSelector((state) => state.dashboard.main)

  switch (main.view.content.kind) {
    case 'table':
      return (
        <Suspense fallback={<CenteredLoader />}>
          <Table {...tableProps} />
        </Suspense>
      )
    case 'contextFile':
      return (
        <Suspense fallback={<CenteredLoader />}>
          <ContextFile {...contextFileProps} />
        </Suspense>
      )
    case 'plots':
      return (
        <Suspense fallback={<CenteredLoader />}>
          <PlotsTab />
        </Suspense>
      )
  }
}

export default DashboardMain
