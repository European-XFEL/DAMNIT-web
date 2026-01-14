import { DashboardBase, DashboardMain } from '@damnit-frontend/ui'
import DashboardHeader, { type DashboardHeaderProps } from './dashboard-header'

type DashboardProps = {
  headerProps: DashboardHeaderProps
}

function Dashboard(props: DashboardProps) {
  return (
    <DashboardBase
      main={<DashboardMain tableProps={{ paginated: false }} />}
      header={<DashboardHeader {...props.headerProps} />}
    />
  )
}

export default Dashboard
