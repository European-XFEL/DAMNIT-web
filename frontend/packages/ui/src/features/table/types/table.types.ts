import type {
  RunCells,
  RunId,
  TableMeta,
} from '#src/data/table/table-data.types'

export type Scroll = {
  x: number
  y: number
}

export type Point = {
  x: number
  y: number
}

// A column the grid draws, in the order it draws them. `title` is the variable's
// whole title; the grid strips the group prefix on its way into the canvas.
export type TableColumn = {
  id: string
  title: string
  group?: string
}

// The columns something put somewhere new or resized. `groups` names a group
// only when the whole group changed, so one member on its own leaves it out.
export type ChangedColumns = {
  columns: string[]
  groups: string[]
}

export type Rectangle = {
  x: number
  y: number
  width: number
  height: number
}

// Rows `first` to `last` of the table, both included.
export type RowRange = {
  first: number
  last: number
}

// The pages in view whose rows or heavy values failed to load and have not
// landed since, and whether any of them waits for the retry clock.
export type LoadErrors = {
  rows: RowRange[]
  values: RowRange[]
  waitsForRetry: boolean
}

export type CellId = {
  run: RunId
  variable: string
}

// The cell under the pointer, with its box in viewport pixels. `normalizedX` is
// 0 at the left edge of the cell's content and 1 at its right edge.
export type HoveredCell = CellId & { bounds: Rectangle; normalizedX: number }

export type CellMenuArgs = CellId & {
  selectedRuns: RunId[]
  position: Point
}

// `selectedVariables` always includes `variable`: a right-click outside the
// selection replaces it with that one column.
export type HeaderMenuArgs = {
  variable: string
  selectedVariables: string[]
  position: Point
}

export type RunGridRef = {
  fitAllColumns: () => void
  resetColumnWidths: () => void
}

// What both run grids take, in run ids and variable names, never in a grid's
// own positions, so the table's menus and hover card are written once.
export type RunGridProps = {
  columns: TableColumn[]
  pinnedCount: number
  groups: TableMeta['groups']
  runs: RunId[]
  cellsByKey: Map<string, RunCells>
  lastUpdatedByKey: ReadonlyMap<string, number>
  // Indices into `runs` and `columns`, not pixels: it says which pages to load.
  onVisibleRegionChanged: (region: Rectangle) => void
  onScroll: () => void
  onCellHovered: (cell: HoveredCell | undefined) => void
  onCellMouseMove: (cell: HoveredCell | undefined) => void
  onCellActivated: (cell: CellId) => void
  onCellContextMenu: (args: CellMenuArgs) => void
  onHeaderContextMenu: (args: HeaderMenuArgs) => void
}
