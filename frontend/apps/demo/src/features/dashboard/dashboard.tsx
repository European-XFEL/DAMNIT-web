import {
  DashboardShell,
  DashboardMain,
  ProposalIdentity,
} from '@damnit-frontend/ui'

type DashboardProps = {
  label: string
  subtitle: string
  instrument: string
}

function Dashboard({ label, subtitle, instrument }: DashboardProps) {
  return (
    <DashboardShell
      main={<DashboardMain />}
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
