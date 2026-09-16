import type {
  ChangedColumns,
  TableColumn,
} from '#src/features/table/types/table.types'

// Every column starts here, whatever it holds. Dragging a header edge or
// double-clicking it writes the user's own width to the store instead.
export const DEFAULT_COLUMN_WIDTH = 100

type ChangedWidthsOptions = {
  // The columns on screen, so a hidden one is never named.
  columns: TableColumn[]
  before: Record<string, number>
  after: Record<string, number>
}

// Which columns a fit or a reset draws at a new width. A fit writes every
// column back, so the stored widths alone cannot tell you what moved.
export function changedWidths({
  columns,
  before,
  after,
}: ChangedWidthsOptions): ChangedColumns {
  const drawnWidth = (sizing: Record<string, number>, id: string) =>
    sizing[id] ?? DEFAULT_COLUMN_WIDTH

  const widthChanged = (column: TableColumn) =>
    drawnWidth(before, column.id) !== drawnWidth(after, column.id)
  const changed = columns.filter(widthChanged)

  // A group is named only when every member on screen changed: a lit strip
  // under a plain band is what says "some of these columns".
  const groupsWithUnchangedMember = new Set(
    columns
      .filter((column) => !widthChanged(column))
      .map((column) => column.group)
  )
  const groups = new Set<string>()
  for (const { group } of changed) {
    if (group != null && !groupsWithUnchangedMember.has(group)) {
      groups.add(group)
    }
  }

  return { columns: changed.map((column) => column.id), groups: [...groups] }
}
