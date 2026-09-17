import { type ReactNode } from 'react'
import { AppShell } from '@mantine/core'

import { useAppSelector } from '#src/app/store/hooks'
import {
  selectMobileNavOpened,
  selectNavCollapsed,
} from '#src/features/dashboard/stores/dashboard.selectors'
import DashboardNavbar from '#src/features/dashboard/components/navbar/dashboard-navbar'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'

import classes from './dashboard-shell.module.css'
import DashboardBody from './dashboard-body'
import DashboardHeader from './dashboard-header'

type DashboardShellProps = {
  main: ReactNode
  identity: ReactNode
  user?: DashboardUser
  homeTo: string
}

function DashboardShell({ main, identity, user, homeTo }: DashboardShellProps) {
  const navCollapsed = useAppSelector(selectNavCollapsed)
  const mobileNavOpened = useAppSelector(selectMobileNavOpened)

  return (
    <AppShell
      style={{ '--app-shell-border-color': 'var(--mantine-color-gray-2)' }}
      header={{ height: 40 }}
      navbar={{
        width: navCollapsed ? 48 : 280,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileNavOpened },
      }}
    >
      <AppShell.Header bg="gray.0">
        <DashboardHeader identity={identity} homeTo={homeTo} />
      </AppShell.Header>
      <AppShell.Navbar
        aria-label="Dashboard"
        className={classes.navbar}
        mod={{ closed: !mobileNavOpened }}
      >
        <DashboardNavbar user={user} />
      </AppShell.Navbar>
      <AppShell.Main className={classes.main}>
        {/* The run sits below the band, which names the page whatever is
            open beside the view. */}
        <DashboardBody main={main} />
      </AppShell.Main>
    </AppShell>
  )
}

export default DashboardShell
