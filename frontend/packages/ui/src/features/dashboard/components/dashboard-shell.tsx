import { useRef, type ReactNode } from 'react'
import { AppShell, VisuallyHidden } from '@mantine/core'
import { useDidUpdate, useFocusReturn } from '@mantine/hooks'

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
  heading: string
  user?: DashboardUser
  homeTo: string
}

function DashboardShell({
  main,
  identity,
  heading,
  user,
  homeTo,
}: DashboardShellProps) {
  const navCollapsed = useAppSelector(selectNavCollapsed)
  const mobileNavOpened = useAppSelector(selectMobileNavOpened)
  const navRef = useRef<HTMLElement>(null)

  // Opening the mobile nav focuses the view on show; closing it hands focus back
  // to the Burger, which useFocusReturn records before that focus moves.
  useFocusReturn({ opened: mobileNavOpened })
  useDidUpdate(() => {
    if (mobileNavOpened) {
      navRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.focus()
    }
  }, [mobileNavOpened])

  return (
    <AppShell
      className={classes.shell}
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
        ref={navRef}
        id="dashboard-nav"
        aria-label="Dashboard"
        className={classes.navbar}
        mod={{ closed: !mobileNavOpened }}
      >
        <DashboardNavbar user={user} />
      </AppShell.Navbar>
      <AppShell.Main className={classes.main}>
        <VisuallyHidden component="h1">{heading}</VisuallyHidden>
        {/* The run sits below the band, which names the page whatever is
            open beside the view. */}
        <DashboardBody main={main} />
      </AppShell.Main>
    </AppShell>
  )
}

export default DashboardShell
