import { useNavigate } from 'react-router'

import { plotAddress } from '#src/features/plots/plot-address'
import Table from '#src/features/table/table'

function TableView() {
  const navigate = useNavigate()

  // A view's plots sit one step up from it.
  return <Table onPlot={(plot) => navigate(`../plots/${plotAddress(plot)}`)} />
}

export default TableView
