import type { TableColumn } from '#src/features/table/types/table.types'

export type LeftBorder = 'edge' | 'inner' | 'none'

type LeftBorderOptions = {
  columns: Pick<TableColumn, 'group'>[]
  pinnedCount: number
}

// The line on the left of column `col`, as Glide numbers columns for its
// hooks: the row marker is -1, and `columns.length` the last column's right.
export function leftBorder(
  col: number,
  { columns, pinnedCount }: LeftBorderOptions
): LeftBorder {
  if (col === pinnedCount || col === columns.length) {
    return 'edge'
  }
  if (col <= 0) {
    return 'none'
  }
  if (col < pinnedCount) {
    return 'inner'
  }
  const group = columns[col]?.group ?? ''
  const previousGroup = columns[col - 1]?.group ?? ''
  return group === previousGroup ? 'inner' : 'edge'
}
