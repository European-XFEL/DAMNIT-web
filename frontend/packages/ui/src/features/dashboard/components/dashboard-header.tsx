import { type ReactNode } from 'react'
import { ActionIcon, Box, Burger, rem } from '@mantine/core'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'

import Logo from '#src/components/headers/logo'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import {
  selectMobileNavOpened,
  selectNavCollapsed,
} from '#src/features/dashboard/stores/dashboard.selectors'
import { useNavRail } from '#src/features/dashboard/hooks/use-nav-rail'
import {
  mobileNavToggled,
  navCollapsed,
  navExpanded,
} from '#src/features/dashboard/stores/dashboard.slice'

import classes from './dashboard-header.module.css'
import ViewCrumbs from './view-crumbs'

type DashboardHeaderProps = {
  identity: ReactNode
  // The proposal as the page title names it, such as "p6996"
  heading: string
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

function DashboardHeader({ identity, heading, homeTo }: DashboardHeaderProps) {
  const dispatch = useAppDispatch()
  const mobileNavOpened = useAppSelector(selectMobileNavOpened)
  const navRail = useNavRail()

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
        <ViewCrumbs identity={identity} heading={heading} />
      </div>
    </div>
  )
}

export default DashboardHeader
