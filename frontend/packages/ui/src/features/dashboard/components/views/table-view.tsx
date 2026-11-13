import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router'

import CenteredLoader from '#src/components/feedback/centered-loader'
import { plotAddress } from '#src/features/plots/plot-address'

const Table = lazy(() => import('#src/features/table/table'))

function TableView() {
  const navigate = useNavigate()

  return (
    <Suspense fallback={<CenteredLoader />}>
      {/* A view's plots sit one step up from it. */}
      <Table onPlot={(plot) => navigate(`../plots/${plotAddress(plot)}`)} />
    </Suspense>
  )
}

export default TableView
