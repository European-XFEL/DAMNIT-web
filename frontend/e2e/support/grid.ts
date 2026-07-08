import { expect, type Page } from '@playwright/test'

// The grid is a Glide <canvas>. Actions that must reach Glide's canvas mouse
// handler (hover, context menu, cell/column selection, activation) are driven by
// real pointer coordinates: the accessibility mirror has no layout box, so it
// never receives these events. These helpers turn an a11y column/row index into
// a canvas point.
//
// COLUMN_WIDTH matches formatColumns (width: 100) in features/table/table.tsx.
// HEADER_HEIGHT and ROW_HEIGHT are Glide's defaults; ROW_MARKER_WIDTH is Glide's
// auto width for a clickable-number marker at this row count (<=100 rows -> 32).
// The math assumes no horizontal scroll and that the nav and aside are collapsed
// so the grid spans the viewport, so `col` must be within the painted horizontal
// fold and `row` within the initial vertical fold.
export const ROW_MARKER_WIDTH = 32
export const COLUMN_WIDTH = 100
export const HEADER_HEIGHT = 36
export const ROW_HEIGHT = 34

export type Box = { x: number; y: number; width: number; height: number }
export type Cell = { col: number; row: number }

// Opening a plot switches to the Plots tab, which unmounts the table, so the
// canvas may be absent when a later grid action runs. Wait for it before reading
// its box.
export async function gridBox(page: Page): Promise<Box> {
  const canvas = page.getByTestId('data-grid-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('grid canvas has no bounding box')
  }
  return box
}

// `col` is the a11y column index: row marker 0, Run 1, first variable 2.
export function columnCenter(box: Box, col: number): number {
  const x =
    box.x + ROW_MARKER_WIDTH + (col - 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2
  if (x > box.x + box.width) {
    throw new Error(
      `column ${col} center (${x}) is outside the grid width ${box.width}; is the aside open?`
    )
  }
  return x
}

export function headerPoint(box: Box, col: number) {
  return { x: columnCenter(box, col), y: box.y + HEADER_HEIGHT / 2 }
}

// Rows start below the fixed header; `row` is 0-based.
export function cellPoint(box: Box, { col, row }: Cell) {
  return {
    x: columnCenter(box, col),
    y: box.y + HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2,
  }
}
