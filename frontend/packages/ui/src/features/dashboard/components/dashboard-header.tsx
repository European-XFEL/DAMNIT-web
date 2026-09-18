import { type ReactNode } from 'react'
import {
  ActionIcon,
  Box,
  Breadcrumbs,
  Burger,
  Text,
  UnstyledButton,
  VisuallyHidden,
  rem,
} from '@mantine/core'
import {
  IconChevronRight,
  IconFileCode,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconTable,
} from '@tabler/icons-react'

import Logo from '#src/components/headers/logo'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import {
  selectActiveView,
  selectMobileNavOpened,
  selectNavCollapsed,
} from '#src/features/dashboard/stores/dashboard.selectors'
import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import { useNavRail } from '#src/features/dashboard/hooks/use-nav-rail'
import PlotKindIcon from '#src/components/icons/plot-kind-icon'
import {
  mobileNavToggled,
  navCollapsed,
  navExpanded,
  viewSelected,
} from '#src/features/dashboard/stores/dashboard.slice'
import { usePlotEntries } from '#src/features/dashboard/hooks/use-plot-entries'
import { TABLE_VIEW } from '#src/features/dashboard/utils/views'

import classes from './dashboard-header.module.css'

type DashboardHeaderProps = {
  identity: ReactNode
  homeTo: string
}

type Crumb = {
  label: string
  icon?: ReactNode
  // Read after the label, since the icon itself is hidden from screen readers.
  iconLabel?: string
  detail?: string
}

function useViewCrumbs(): Crumb[] {
  const view = useAppSelector(selectActiveView)
  const plots = usePlotEntries()

  switch (view.kind) {
    case 'table':
      return [
        { label: 'Table' },
        { label: 'All runs', icon: <IconTable stroke={1.5} /> },
      ]
    case 'context-file':
      return [{ label: 'Context file', icon: <IconFileCode stroke={1.5} /> }]
    case 'plot': {
      const plot = plots.find((entry) => entry.view.id === view.id)
      if (!plot) {
        return [{ label: 'Plots' }]
      }
      return [
        { label: 'Plots' },
        {
          label: plot.name,
          icon: <PlotKindIcon kind={plot.kind} />,
          iconLabel: `${plot.kind} plot`,
          detail: plot.subtitle,
        },
      ]
    }
  }
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

function DashboardHeader({ identity, homeTo }: DashboardHeaderProps) {
  const dispatch = useAppDispatch()
  const mobileNavOpened = useAppSelector(selectMobileNavOpened)
  const navRail = useNavRail()
  const crumbs = useViewCrumbs()
  // Below `sm` the row has no width for the group a view sits in. Not
  // `hiddenFrom`: Mantine leaves the separator of a hidden crumb behind.
  const shown = useIsMobile() ? crumbs.slice(-1) : crumbs

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
        <nav aria-label="Breadcrumb" className={classes.nav}>
          <Breadcrumbs
            separator={
              <IconChevronRight
                style={{ width: rem(12), height: rem(12) }}
                stroke={2}
              />
            }
            separatorMargin={8}
            classNames={{
              root: classes.crumbs,
              separator: classes.separator,
              breadcrumb: classes.crumb,
            }}
          >
            <UnstyledButton
              className={classes.identity}
              onClick={() => dispatch(viewSelected(TABLE_VIEW))}
            >
              {identity}
            </UnstyledButton>
            {shown.map((crumb, index) => {
              const isLast = index === shown.length - 1
              return (
                <Text
                  key={index}
                  span
                  size="sm"
                  c={isLast ? 'gray.7' : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.icon && (
                    <span className={classes.icon} aria-hidden>
                      {crumb.icon}
                    </span>
                  )}
                  {crumb.label}
                  {crumb.iconLabel && (
                    <VisuallyHidden>, {crumb.iconLabel}</VisuallyHidden>
                  )}
                  {crumb.detail && (
                    <Text span inherit c="gray.6">
                      {` (${crumb.detail})`}
                    </Text>
                  )}
                </Text>
              )
            })}
          </Breadcrumbs>
        </nav>
      </div>
    </div>
  )
}

export default DashboardHeader
