import { useMemo } from 'react'

import { runKey } from '#src/data/table/table-data.transforms'
import type { RunId } from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { useAppSelector } from '#src/app/store/hooks'
import { selectRowSelection } from '#src/features/table/stores/table.selectors'

// The selected run, resolved against the table it belongs to. A key naming a run
// the current table no longer lists reads as nothing selected, so the lookup is
// also the staleness check.
export function useSelectedRun(): RunId | undefined {
  const rowSelection = useAppSelector(selectRowSelection)
  const { runs } = useTableMeta()

  return useMemo(() => {
    const [key] = Object.keys(rowSelection)
    return key == null ? undefined : runs.find((entry) => runKey(entry) === key)
  }, [rowSelection, runs])
}
