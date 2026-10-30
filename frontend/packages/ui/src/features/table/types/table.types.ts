export type Scroll = {
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
