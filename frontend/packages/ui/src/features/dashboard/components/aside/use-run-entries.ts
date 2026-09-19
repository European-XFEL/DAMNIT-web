import { useFragment } from '@apollo/client/react'

import { runEntries } from '#src/data/table/run-entries'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import { cellsByName } from '#src/data/table/table-data.transforms'
import type { Run, RunId } from '#src/data/table/table-data.types'
import { useTableMeta, useTableVariables } from '#src/data/table/use-table-meta'
import { useVisibleColumns } from '#src/features/table/hooks/use-column-visibility'
import { useAppSelector } from '#src/app/store/hooks'

// The run as the panel lists it, or null until the cache holds all of it.
export function useRunEntries(runId: RunId, drilled: string | null) {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const variables = useTableVariables()
  const { groups } = useTableMeta()
  const visible = useVisibleColumns()

  // Read the run from the cache by the key it normalizes on: the run id's
  // proposal and run, plus the `database` that is constant across the table.
  const { data: run, complete } = useFragment<Run>({
    fragment: RUN_FRAGMENT,
    from: {
      __typename: 'DamnitRun',
      database: proposal,
      proposal: runId.proposal,
      run: runId.run,
    },
  })

  if (!complete) {
    return null
  }

  return runEntries({
    cells: cellsByName(run.cells ?? []),
    variables,
    groups,
    visible,
    drilled,
  })
}
