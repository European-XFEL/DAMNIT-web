import { useRef, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import {
  ActionIcon,
  AppShell,
  Loader,
  UnstyledButton,
  rem,
} from '@mantine/core'
import { IconFileCode, IconPlus, IconTable } from '@tabler/icons-react'

import { UserMenu } from '#src/components/headers/user-menu'
import SectionHeading from '#src/components/headings/section-heading'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'
import { PENDING_DELAY, useShownAfter } from '#src/hooks/use-shown-after'

import classes from './navbar.module.css'
import PlotEntries from './plot-entries'

type NavHeaderProps = {
  label: string
  action?: ReactNode
}

// Groups the views of one kind. A label, never a view, so it cannot be picked.
function NavHeader({ label, action }: NavHeaderProps) {
  return (
    <div className={classes.header}>
      <SectionHeading>{label}</SectionHeading>
      {action}
    </div>
  )
}

type NavItemProps = {
  icon: ReactNode
  label: string
  to: string
  end?: boolean
}

type NavItemIconProps = {
  icon: ReactNode
  pending: boolean
}

// A view whose code is still on its way swaps its icon for a spinner, after a
// moment, so a quick load never flashes one.
function NavItemIcon({ icon, pending }: NavItemIconProps) {
  const shown = useShownAfter(pending, { delay: PENDING_DELAY })

  return (
    <span className={classes.icon}>
      {shown ? <Loader size={18} color="gray.7" /> : icon}
    </span>
  )
}

// A link to a view, marked `aria-current` while its view is on show.
function NavItem({ icon, label, to, end }: NavItemProps) {
  return (
    <UnstyledButton
      component={NavLink}
      to={to}
      end={end}
      className={classes.item}
    >
      {({ isPending }: { isPending: boolean }) => (
        <>
          <NavItemIcon icon={icon} pending={isPending} />
          {label}
        </>
      )}
    </UnstyledButton>
  )
}

type ExpandedNavbarProps = {
  user?: DashboardUser
  onNewPlot: () => void
}

function ExpandedNavbar({ user, onNewPlot }: ExpandedNavbarProps) {
  const newPlotRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <AppShell.Section grow className={classes.scroll}>
        <ul className={classes.list}>
          <li>
            <NavHeader label="Table" />
            <ul className={classes.entries} aria-label="Table">
              <li>
                <NavItem
                  icon={
                    <IconTable
                      style={{ width: rem(18), height: rem(18) }}
                      stroke={1.5}
                    />
                  }
                  label="All runs"
                  // Every saved table view will sit under this path.
                  to="table"
                  end
                />
              </li>
            </ul>
          </li>
          <li>
            <NavHeader
              label="Plots"
              action={
                <ActionIcon
                  ref={newPlotRef}
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="New plot"
                  onClick={onNewPlot}
                >
                  <IconPlus
                    style={{ width: rem(16), height: rem(16) }}
                    stroke={1.5}
                  />
                </ActionIcon>
              }
            />
            <PlotEntries
              empty="No plots"
              onLastClosed={() => newPlotRef.current?.focus()}
            />
          </li>
          {/* One file, so a plain item rather than a header over one entry. */}
          <li>
            <NavItem
              icon={
                <IconFileCode
                  style={{ width: rem(18), height: rem(18) }}
                  stroke={1.5}
                />
              }
              label="Context file"
              to="context-file"
            />
          </li>
        </ul>
      </AppShell.Section>
      {user && (
        <AppShell.Section className={classes.bottom}>
          <UserMenu
            userName={user.name}
            onLogout={user.onLogout}
            variant="nav"
          />
        </AppShell.Section>
      )}
    </>
  )
}

export default ExpandedNavbar
