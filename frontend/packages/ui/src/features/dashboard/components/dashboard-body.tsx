import { type ReactNode } from 'react'
import { Box } from '@mantine/core'

import { useSelectedRun } from '#src/features/table/hooks/use-selected-run'
import { useAppSelector } from '#src/app/store/hooks'
import {
  selectActiveView,
  selectMobileNavOpened,
} from '#src/features/dashboard/stores/dashboard.selectors'
import DashboardAside from '#src/features/dashboard/components/aside/dashboard-aside'

import classes from './dashboard-body.module.css'

type DashboardBodyProps = {
  main: ReactNode
}

// The view and the run beside it, apart from the shell so a run change
// re-renders them and not the header and nav.
function DashboardBody({ main }: DashboardBodyProps) {
  const mobileNavOpened = useAppSelector(selectMobileNavOpened)
  const onTable = useAppSelector(
    (state) => selectActiveView(state).kind === 'table'
  )
  const selectedRun = useSelectedRun()

  return (
    <Box className={classes.body} mod={{ covered: mobileNavOpened }}>
      <Box
        className={classes.view}
        mod={{ covered: onTable && selectedRun != null }}
      >
        {main}
      </Box>
      <DashboardAside />
    </Box>
  )
}

export default DashboardBody
