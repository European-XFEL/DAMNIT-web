import { useRef, type ReactNode } from 'react'
import { useNavigation } from 'react-router'
import { AppShell, getDefaultZIndex, VisuallyHidden } from '@mantine/core'
import { useDidUpdate, useFocusReturn } from '@mantine/hooks'

import { useAppSelector } from '#src/app/store/hooks'
import StatusBar from '#src/components/statuses/status-bar'
import { ViewStatusProvider } from '#src/components/statuses/view-status'
import { PENDING_DELAY, useShownAfter } from '#src/hooks/use-shown-after'
import {
  selectMobileNavOpened,
  selectNavCollapsed,
} from '#src/features/dashboard/stores/dashboard.selectors'
import DashboardNavbar from '#src/features/dashboard/components/navbar/dashboard-navbar'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'

import classes from './dashboard-shell.module.css'
import DashboardBody from './dashboard-body'
import DashboardHeader from './dashboard-header'
import LiveUpdatesItem from './status/live-updates-item'
import ReadOnlyItem from './status/read-only-item'

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

  // A view's code on its way. The bar waits a moment, so a quick load never
  // flashes it.
  const loading = useNavigation().state === 'loading'
  const pending = useShownAfter(loading, { delay: PENDING_DELAY })

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
      footer={{ height: 28 }}
    >
      <AppShell.Header bg="gray.1">
        <DashboardHeader
          identity={identity}
          heading={heading}
          homeTo={homeTo}
        />
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
      <ViewStatusProvider>
        <AppShell.Main
          className={classes.main}
          aria-busy={loading || undefined}
        >
          <VisuallyHidden component="h1">{heading}</VisuallyHidden>
          {/* The run sits below the band, which names the page whatever is
              open beside the view. */}
          <DashboardBody main={main} pending={pending} />
        </AppShell.Main>
        {/* Over the navbar's app + 1, so a status item's bubble draws above the nav. */}
        <AppShell.Footer
          aria-label="Status bar"
          zIndex={getDefaultZIndex('app') + 2}
        >
          <StatusBar>
            <LiveUpdatesItem />
            <ReadOnlyItem />
          </StatusBar>
        </AppShell.Footer>
      </ViewStatusProvider>
    </AppShell>
  )
}

export default DashboardShell
