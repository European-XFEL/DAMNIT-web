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

export type Rectangle = {
  x: number
  y: number
  width: number
  height: number
}
