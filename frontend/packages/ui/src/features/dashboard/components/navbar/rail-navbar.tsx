import {
  forwardRef,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  AppShell,
  Divider,
  FocusTrap,
  Popover,
  Tooltip,
  UnstyledButton,
  rem,
} from '@mantine/core'
import {
  IconChartLine,
  IconFileCode,
  IconPlus,
  IconTable,
} from '@tabler/icons-react'
import cx from 'clsx'

import { UserMenu } from '#src/components/headers/user-menu'
import { usePlotEntries } from '#src/features/dashboard/hooks/use-plot-entries'
import { useViews } from '#src/features/dashboard/hooks/use-views'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'
import {
  CONTEXT_FILE_VIEW,
  TABLE_VIEW,
} from '#src/features/dashboard/utils/views'

import classes from './navbar.module.css'
import PlotEntries from './plot-entries'

type RailButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
  icon: ReactNode
  label: string
  active: boolean
}

// Forwards its ref so a Popover.Target can anchor the Plots popover to it.
const RailButton = forwardRef<HTMLButtonElement, RailButtonProps>(
  function RailButton({ icon, label, active, ...others }, ref) {
    return (
      <Tooltip label={label} position="right" withArrow>
        <UnstyledButton
          {...others}
          ref={ref}
          className={classes.railButton}
          mod={{ active }}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
        >
          {icon}
        </UnstyledButton>
      </Tooltip>
    )
  }
)

type RailNavbarProps = {
  user?: DashboardUser
  onNewPlot: () => void
}

function RailNavbar({ user, onNewPlot }: RailNavbarProps) {
  const views = useViews()
  const plots = usePlotEntries()
  const plotActive = plots.some(({ view }) => views.isActive(view))
  const [plotsOpened, setPlotsOpened] = useState(false)
  const plotsRef = useRef<HTMLButtonElement>(null)
  const newPlotRef = useRef<HTMLButtonElement>(null)

  // A pick unmounts the focused row, so focus goes back to Plots as on Escape,
  // and the plot dialog returns there when it closes.
  function closePlotsPopover() {
    setPlotsOpened(false)
    plotsRef.current?.focus()
  }

  // Mantine's trap wraps Shift+Tab only from the first row, so from the hidden
  // start it would leave the popover open behind the focus.
  function wrapToNewPlot(event: KeyboardEvent) {
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault()
      newPlotRef.current?.focus()
    }
  }

  return (
    <>
      <AppShell.Section grow className={classes.rail}>
        <RailButton
          icon={
            <IconTable
              style={{ width: rem(20), height: rem(20) }}
              stroke={1.5}
            />
          }
          label="Table"
          active={views.isActive(TABLE_VIEW)}
          onClick={() => views.select(TABLE_VIEW)}
        />
        <Popover
          opened={plotsOpened}
          onChange={setPlotsOpened}
          position="right-start"
          width={260}
          offset={4}
          middlewares={{ size: { padding: 8 } }}
          trapFocus
          // Like Menu, a key pressed outside closes it as a click would.
          clickOutsideEvents={['mousedown', 'touchstart', 'keydown']}
        >
          <Popover.Target>
            <RailButton
              ref={plotsRef}
              icon={
                <IconChartLine
                  style={{ width: rem(20), height: rem(20) }}
                  stroke={1.5}
                />
              }
              label="Plots"
              active={plotActive}
              onClick={() => setPlotsOpened((opened) => !opened)}
            />
          </Popover.Target>
          <Popover.Dropdown className={classes.popover}>
            {/* Focus starts on a hidden spot, so no close mark shows. */}
            <FocusTrap.InitialFocus onKeyDown={wrapToNewPlot} />
            <div className={classes.scroll}>
              <PlotEntries
                iconSize={16}
                onSelect={closePlotsPopover}
                onLastClosed={() => newPlotRef.current?.focus()}
              />
            </div>
            {plots.length > 0 && <Divider my={4} color="gray.2" />}
            <UnstyledButton
              ref={newPlotRef}
              className={classes.item}
              onClick={() => {
                closePlotsPopover()
                onNewPlot()
              }}
            >
              <span className={classes.icon}>
                <IconPlus
                  style={{ width: rem(16), height: rem(16) }}
                  stroke={1.5}
                />
              </span>
              New plot
            </UnstyledButton>
          </Popover.Dropdown>
        </Popover>
        <RailButton
          icon={
            <IconFileCode
              style={{ width: rem(20), height: rem(20) }}
              stroke={1.5}
            />
          }
          label="Context file"
          active={views.isActive(CONTEXT_FILE_VIEW)}
          onClick={() => views.select(CONTEXT_FILE_VIEW)}
        />
      </AppShell.Section>
      {user && (
        <AppShell.Section className={cx(classes.rail, classes.railBottom)}>
          <UserMenu
            userName={user.name}
            onLogout={user.onLogout}
            variant="rail"
          />
        </AppShell.Section>
      )}
    </>
  )
}

export default RailNavbar
