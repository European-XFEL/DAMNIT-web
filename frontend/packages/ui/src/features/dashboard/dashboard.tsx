import useCurrentProposal from '#src/data/metadata/use-current-proposal'

import DashboardBase from './dashboard.base'
import DashboardHeader from './dashboard.header'
import DashboardMain from './dashboard.main'
export default function Dashboard() {
  const { proposal, isLoading } = useCurrentProposal()
  if (isLoading) {
    return
  }

  return (
    <DashboardBase
      main={<DashboardMain />}
      header={<DashboardHeader proposal={proposal} />}
    />
  )
}
