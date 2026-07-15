import DashboardBase from './dashboard.base'
import DashboardHeader from './dashboard.header'
import DashboardMain from './dashboard.main'
import useCurrentProposal from '../../data/metadata/use-current-proposal'
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
