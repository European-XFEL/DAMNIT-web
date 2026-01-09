import { DashboardBase, DashboardMain } from '@damnit-frontend/ui'
import DashboardHeader from './dashboard-header'

function Dashboard() {
  return (
    <DashboardBase
      main={<DashboardMain tableProps={{ paginated: false }} />}
      header={<DashboardHeader />}
    />
  )
}

export default Dashboard
