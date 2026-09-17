import { CloseButton, Tabs } from '@mantine/core'

import { useSelectedRun } from '#src/features/table/hooks/use-selected-run'
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
  const onTable = useAppSelector(
    (state) => selectActiveView(state).kind === 'table'
  )

  if (selectedRun == null) {
    return null
  }

  return (
    <aside
      aria-label="Run"
      className={classes.aside}
      data-off-table={!onTable || undefined}
    >
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
          <Tabs.Tab value="run">{`Run: ${selectedRun.run}`}</Tabs.Tab>
          <CloseButton
            ml="auto"
            className={classes.close}
            aria-label={`Close run ${selectedRun.run}`}
            onClick={() => dispatch(runDeselected())}
          />
        </Tabs.List>
        <Tabs.Panel value="run" pt="xs">
          <RunDetails />
        </Tabs.Panel>
      </Tabs>
    </aside>
  )
}

export default DashboardAside
