import { Outlet } from 'react-router'

import { DashboardShell, ProposalIdentity } from '@damnit-frontend/ui'

type DashboardProps = {
  label: string
  subtitle: string
  instrument: string
}

function Dashboard({ label, subtitle, instrument }: DashboardProps) {
  return (
    <DashboardShell
      main={<Outlet />}
      heading={label}
      identity={
        <ProposalIdentity
          instrument={instrument}
          label={label}
          title={subtitle}
        />
      }
      homeTo="/"
    />
  )
}

export default Dashboard
