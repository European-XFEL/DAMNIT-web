import type { MouseEvent, ReactNode } from 'react'
import { Link, useHref, useLocation, useNavigate } from 'react-router'
import { ActionIcon, AppShell, VisuallyHidden, rem } from '@mantine/core'
import { IconLayoutDashboard } from '@tabler/icons-react'

import Logo from '#src/components/headers/logo'
import StatusBar from '#src/components/statuses/status-bar'
import { ViewStatusProvider } from '#src/components/statuses/view-status'
import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import {
  askOpenerToShow,
  raiseOpener,
} from '#src/features/dashboard/utils/opener-messages'
import { withoutWindowFlag } from '#src/features/plots/plot-address'
import { isPlainClick, isPopup } from '#src/utils/popup'

import classes from './plot-window.module.css'
import HeaderButton from './header-button'
import PageTitle from './page-title'
import PendingBar from './pending-bar'
import ViewCrumbs from './view-crumbs'
import LiveUpdatesItem from './status/live-updates-item'

type PlotWindowProps = {
  main: ReactNode
  identity: ReactNode
  heading: string
  homeTo: string
  loading: boolean
  pending: boolean
}

type OpenInDashboardProps = {
  compact: boolean
}

// Compact below `sm`, where the label would leave the plot's crumb no width.
function OpenInDashboard({ compact }: OpenInDashboardProps) {
  const { pathname, search } = useLocation()
  const to = { pathname, search: withoutWindowFlag(search) }
  const href = useHref(to)
  const navigate = useNavigate()

  const showInDashboard = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) {
      return
    }

    event.preventDefault()
    if (await askOpenerToShow(to)) {
      raiseOpener()
      window.close()
      return
    }

    if (window.open(href, '_blank')) {
      window.close()
      return
    }

    // A blocked tab leaves the click to the router, as a link in a tab.
    void navigate(to)
  }

  // A window opened as a tab keeps the plain link, which turns it into the
  // dashboard in place.
  const onClick = isPopup()
    ? (event: MouseEvent<HTMLAnchorElement>) => void showInDashboard(event)
    : undefined

  if (compact) {
    return (
      <ActionIcon
        component={Link}
        to={to}
        onClick={onClick}
        variant="subtle"
        color="gray"
        size="sm"
        aria-label="Open in dashboard"
      >
        <IconLayoutDashboard
          style={{ width: rem(16), height: rem(16) }}
          stroke={1.5}
        />
      </ActionIcon>
    )
  }

  return (
    <HeaderButton to={to} onClick={onClick} icon={IconLayoutDashboard}>
      Open in dashboard
    </HeaderButton>
  )
}

function PlotWindow({
  main,
  identity,
  heading,
  homeTo,
  loading,
  pending,
}: PlotWindowProps) {
  const isMobile = useIsMobile()

  return (
    <AppShell
      style={{ '--app-shell-border-color': 'var(--mantine-color-gray-2)' }}
      header={{ height: 40 }}
      footer={{ height: 28 }}
    >
      <AppShell.Header bg="gray.1">
        <div className={classes.band}>
          <div className={classes.logoCell}>
            <Logo linkTo={homeTo} compact={isMobile} />
          </div>
          <div className={classes.crumbRow}>
            <ViewCrumbs identity={identity} />
            <OpenInDashboard compact={isMobile} />
          </div>
        </div>
      </AppShell.Header>
      <ViewStatusProvider>
        <AppShell.Main
          className={classes.main}
          aria-busy={loading || undefined}
        >
          <VisuallyHidden component="h1">{heading}</VisuallyHidden>
          <PageTitle heading={heading} />
          <div className={classes.view}>
            {pending && <PendingBar />}
            {main}
          </div>
        </AppShell.Main>
        <AppShell.Footer aria-label="Status bar">
          <StatusBar>
            <LiveUpdatesItem />
          </StatusBar>
        </AppShell.Footer>
      </ViewStatusProvider>
    </AppShell>
  )
}

export default PlotWindow
