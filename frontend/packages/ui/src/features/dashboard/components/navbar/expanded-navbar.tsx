import { useRef, type ReactNode } from 'react'
import { ActionIcon, AppShell, UnstyledButton, rem } from '@mantine/core'
import { IconFileCode, IconPlus, IconTable } from '@tabler/icons-react'

import { UserMenu } from '#src/components/headers/user-menu'
import SectionHeading from '#src/components/headings/section-heading'
import { useViews } from '#src/features/dashboard/hooks/use-views'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'
import {
  CONTEXT_FILE_VIEW,
  TABLE_VIEW,
} from '#src/features/dashboard/utils/views'

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
  active: boolean
  onClick: () => void
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <UnstyledButton
      className={classes.item}
      mod={{ active }}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className={classes.icon}>{icon}</span>
      {label}
    </UnstyledButton>
  )
}

type ExpandedNavbarProps = {
  user?: DashboardUser
  onNewPlot: () => void
}

function ExpandedNavbar({ user, onNewPlot }: ExpandedNavbarProps) {
  const views = useViews()
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
                  active={views.isActive(TABLE_VIEW)}
                  onClick={() => views.select(TABLE_VIEW)}
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
              empty="(None)"
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
              active={views.isActive(CONTEXT_FILE_VIEW)}
              onClick={() => views.select(CONTEXT_FILE_VIEW)}
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
