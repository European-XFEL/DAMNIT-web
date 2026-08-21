import { useMemo } from 'react'

import { getVariableTitle } from '#src/data/table/table-data.transforms'
import { useTableVariables } from '#src/data/table/use-table-meta'
import { useAppSelector } from '#src/app/store/hooks'
import { selectColumnPinning } from '#src/features/table/stores/table.selectors'
import { useVisibleColumns } from '#src/features/table/hooks/use-column-visibility'
import { pinnedFirst } from '#src/features/table/utils/pinned-columns'
import type { TableColumn } from '#src/features/table/types/table.types'

// The columns the grid draws, and how many of them it should freeze. Glide
// freezes a leading run of columns, so the pinned ones have to lead the list for
// the count to mean anything.
export function useTableColumns(): {
  columns: TableColumn[]
  pinnedCount: number
} {
  const variables = useTableVariables()
  const visibleColumns = useVisibleColumns()
  const { start: pinned } = useAppSelector(selectColumnPinning)

  return useMemo(() => {
    const shown = variables.filter(({ name }) => visibleColumns[name] !== false)
    const { start, centre } = pinnedFirst(shown, pinned)

    return {
      columns: [...start, ...centre].map((variable) => ({
        id: variable.name,
        title: getVariableTitle(variable),
        group: variable.group,
      })),
      pinnedCount: start.length,
    }
  }, [variables, visibleColumns, pinned])
}
