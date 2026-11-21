import { type ReactNode } from 'react'
import { ActionIcon, Box, Burger, rem } from '@mantine/core'
import {
  IconExternalLink,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'

import Logo from '#src/components/headers/logo'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import {
  selectMobileNavOpened,
  selectNavCollapsed,
} from '#src/features/dashboard/stores/dashboard.selectors'
import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import { useNavRail } from '#src/features/dashboard/hooks/use-nav-rail'
import { useOpenView } from '#src/features/dashboard/hooks/use-open-view'
import {
  mobileNavToggled,
  navCollapsed,
  navExpanded,
} from '#src/features/dashboard/stores/dashboard.slice'
import { plotWindowAddress } from '#src/features/plots/plot-address'
import type { PlotSpec } from '#src/types'
import { openPopup } from '#src/utils/popup'

import classes from './dashboard-header.module.css'
import HeaderButton from './header-button'
import ViewCrumbs from './view-crumbs'

type DashboardHeaderProps = {
  identity: ReactNode
  homeTo: string
}

// Above `sm` the nav is always there and this folds it to the rail; below,
// the Burger in the same slot shows and hides it instead.
function NavToggle() {
  const dispatch = useAppDispatch()
  const collapsed = useAppSelector(selectNavCollapsed)
  const Icon = collapsed
    ? IconLayoutSidebarLeftExpand
    : IconLayoutSidebarLeftCollapse

  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      visibleFrom="sm"
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      onClick={() => dispatch(collapsed ? navExpanded() : navCollapsed())}
    >
      <Icon style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
    </ActionIcon>
  )
}

type OpenInNewWindowProps = {
  plot: PlotSpec
}

// In the place the window keeps Open in dashboard, so the way out and the way
// back sit on the same spot.
function OpenInNewWindow({ plot }: OpenInNewWindowProps) {
  return (
    <HeaderButton
      to={`plots/${plotWindowAddress(plot)}`}
      target="_blank"
      icon={IconExternalLink}
      onClick={openPopup}
    >
      Open in new window
    </HeaderButton>
  )
}

function DashboardHeader({ identity, homeTo }: DashboardHeaderProps) {
  const dispatch = useAppDispatch()
  const mobileNavOpened = useAppSelector(selectMobileNavOpened)
  const navRail = useNavRail()
  const isMobile = useIsMobile()
  const view = useOpenView()

  // Only a plot the crumbs name, never a broken link, and by the address the
  // table links to. Not on a phone, which has no second screen for the window.
  const plot = useAppSelector((state) =>
    view?.kind === 'plot' && view.id !== undefined
      ? state.plots.data[view.id]
      : undefined
  )

  return (
    <div className={classes.band}>
      <Box className={classes.navCell} mod={{ rail: navRail }}>
        <Logo linkTo={homeTo} compact={navRail} />
      </Box>
      <div className={classes.crumbRow}>
        <Burger
          opened={mobileNavOpened}
          onClick={() => dispatch(mobileNavToggled())}
          hiddenFrom="sm"
          size="sm"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpened}
          aria-controls="dashboard-nav"
        />
        <NavToggle />
        <ViewCrumbs identity={identity} />
        {plot !== undefined && !isMobile && <OpenInNewWindow plot={plot} />}
      </div>
    </div>
  )
}

export default DashboardHeader
