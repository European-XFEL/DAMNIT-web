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
