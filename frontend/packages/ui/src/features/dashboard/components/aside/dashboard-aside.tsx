import { useState } from 'react'
import { CloseButton, Tabs } from '@mantine/core'

import { useSelectedRun } from '#src/features/table/hooks/use-selected-run'
import { selectActiveVariable } from '#src/features/table/stores/table.selectors'
import { runDeselected } from '#src/features/table/stores/table.slice'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { selectActiveView } from '#src/features/dashboard/stores/dashboard.selectors'

import classes from './dashboard-aside.module.css'
import RunDetails from './run-details'

// No open state of its own: the aside shows whatever run the table has
// selected, so it opens and closes with that selection.
function DashboardAside() {
  const dispatch = useAppDispatch()
  const selectedRun = useSelectedRun()
  const activeVariable = useAppSelector(selectActiveVariable)
  const onTable = useAppSelector(
    (state) => selectActiveView(state).kind === 'table'
  )
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

  return (
    <aside
      aria-label="Run"
      className={classes.aside}
      data-opened={opened || undefined}
      data-off-table={!onTable || undefined}
    >
      {shown.run != null && (
        <Tabs
          value="run"
          radius="lg"
          color="indigo"
          classNames={{
            root: classes.tabs,
            list: classes.head,
            panel: classes.panel,
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="run">{`Run: ${shown.run.run}`}</Tabs.Tab>
            <CloseButton
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
