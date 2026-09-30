import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { CloseButton, Tabs, rem } from '@mantine/core'
import { useDidUpdate } from '@mantine/hooks'
import { IconX } from '@tabler/icons-react'

import { useSelectedRun } from '#src/features/table/hooks/use-selected-run'
import { selectActiveVariable } from '#src/features/table/stores/table.selectors'
import { runDeselected } from '#src/features/table/stores/table.slice'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import { selectActiveView } from '#src/features/dashboard/stores/dashboard.selectors'

import classes from './dashboard-aside.module.css'
import RunDetails from './run-details'

// Glide's canvas, which holds the grid's keyboard focus.
const GRID_CANVAS = '[data-testid="data-grid-canvas"]'

type DashboardAsideProps = {
  viewRef: RefObject<HTMLDivElement>
}

// No open state of its own: the aside shows whatever run the table has
// selected, so it opens and closes with that selection.
function DashboardAside({ viewRef }: DashboardAsideProps) {
  const dispatch = useAppDispatch()
  const selectedRun = useSelectedRun()
  const activeVariable = useAppSelector(selectActiveVariable)
  const onTable = useAppSelector(
    (state) => selectActiveView(state).kind === 'table'
  )
  const isMobile = useIsMobile()
  const asideRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Weak, so the element of a view that has since unmounted can be freed.
  const lastViewFocus = useRef<WeakRef<HTMLElement> | null>(null)
  const opened = selectedRun != null

  // Closing clears the selection before the panel has slid away, so it keeps
  // drawing the run and variable it last showed.
  const [shown, setShown] = useState({
    run: selectedRun,
    variable: activeVariable,
  })
  if (
    opened &&
    (selectedRun !== shown.run || activeVariable !== shown.variable)
  ) {
    setShown({ run: selectedRun, variable: activeVariable })
  }

  // Below `sm` the run hides the table, so focus in it moves to the close
  // button, including the focus Glide gives its canvas a frame after a click.
  const coversTable = opened && onTable && isMobile
  useEffect(() => {
    const view = viewRef.current
    if (view == null) {
      return
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) {
        lastViewFocus.current = new WeakRef(event.target)
      }
      if (coversTable) {
        closeRef.current?.focus()
      }
    }

    view.addEventListener('focusin', handleFocusIn)
    return () => view.removeEventListener('focusin', handleFocusIn)
  }, [viewRef, coversTable])

  useDidUpdate(() => {
    if (coversTable && viewRef.current?.contains(document.activeElement)) {
      closeRef.current?.focus()
    }
  }, [coversTable])

  // Closing from the panel hands focus back to where it last was in the view,
  // or to the grid when another view has replaced that element since.
  useDidUpdate(() => {
    const active = document.activeElement
    const focusOnPanel =
      active === document.body || asideRef.current?.contains(active)
    if (opened || !focusOnPanel) {
      return
    }

    const lastFocused = lastViewFocus.current?.deref()
    const target = lastFocused?.isConnected
      ? lastFocused
      : viewRef.current?.querySelector<HTMLElement>(GRID_CANVAS)
    target?.focus()
  }, [opened])

  // Escape closes the run from the panel as it does from the grid.
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      dispatch(runDeselected())
    }
  }

  return (
    <aside
      ref={asideRef}
      aria-label="Run"
      className={classes.aside}
      data-opened={opened || undefined}
      data-off-table={!onTable || undefined}
      onKeyDown={handleKeyDown}
    >
      {shown.run != null && (
        <Tabs
          value="run"
          radius="lg"
          color="indigo"
          classNames={{
            root: classes.tabs,
            list: classes.head,
            tab: classes.tab,
            panel: classes.panel,
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="run">{`Run ${shown.run.run}`}</Tabs.Tab>
            <CloseButton
              ref={closeRef}
              size="sm"
              icon={
                <IconX
                  style={{ width: rem(16), height: rem(16) }}
                  stroke={1.5}
                />
              }
              ml="auto"
              className={classes.close}
              aria-label={`Close run ${shown.run.run}`}
              onClick={() => dispatch(runDeselected())}
            />
          </Tabs.List>
          <Tabs.Panel value="run" pt="xs">
            <RunDetails run={shown.run} variable={shown.variable} />
          </Tabs.Panel>
        </Tabs>
      )}
    </aside>
  )
}

export default DashboardAside
