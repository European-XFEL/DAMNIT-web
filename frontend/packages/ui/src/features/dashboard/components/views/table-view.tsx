import { useNavigate } from 'react-router'

import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import {
  plotAddress,
  plotWindowAddress,
} from '#src/features/plots/plot-address'
import Table from '#src/features/table/table'

function TableView() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // A view's plots sit one step up from it. A phone gets no plot window, as
  // in the header.
  return (
    <Table
      onPlot={(plot) => navigate(`../plots/${plotAddress(plot)}`)}
      plotWindowLink={
        isMobile ? undefined : (plot) => `../plots/${plotWindowAddress(plot)}`
      }
    />
  )
}

export default TableView
