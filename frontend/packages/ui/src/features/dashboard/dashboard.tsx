import { useNavigate } from 'react-router'

import { selectUserFullName } from '#src/features/auth/auth.slice'
import useCurrentProposal from '#src/data/metadata/use-current-proposal'
import { useAppSelector } from '#src/app/store/hooks'
import DashboardShell from '#src/features/dashboard/components/dashboard-shell'
import DashboardMain from '#src/features/dashboard/components/dashboard-main'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'

export default function Dashboard() {
  const { proposal, isLoading } = useCurrentProposal()
  const userName = useAppSelector(selectUserFullName)
  const navigate = useNavigate()

  if (isLoading) {
    return
  }

  return (
    <DashboardShell
      main={<DashboardMain />}
      identity={
        <ProposalIdentity
          instrument={proposal.instrument}
          label={`p${proposal.number}`}
          detail={proposal.principal_investigator}
          title={proposal.title}
        />
      }
      user={
        userName
          ? { name: userName, onLogout: () => navigate('/logout') }
          : undefined
      }
      homeTo="/home"
    />
  )
}
