import { expect, type Locator, type Page } from '@playwright/test'

// The grid is a Glide <canvas>. Actions that must reach Glide's canvas mouse
// handler (hover, context menu, cell/column selection, activation) are driven by
// real pointer coordinates: the accessibility mirror has no layout box, so it
// never receives these events. These helpers turn an a11y column/row index into
// a canvas point.
//
// COLUMN_WIDTH matches the width the gridColumns memo sets in
// features/table/table.tsx.
// HEADER_HEIGHT and ROW_HEIGHT are Glide's defaults; ROW_MARKER_WIDTH is Glide's
// auto width for a clickable-number marker at this row count (<=100 rows -> 32).
// The math assumes no horizontal scroll and that the nav and aside are collapsed
// so the grid spans the viewport, so `col` must be within the painted horizontal
// fold and `row` within the initial vertical fold.
export const ROW_MARKER_WIDTH = 32
export const COLUMN_WIDTH = 100
export const HEADER_HEIGHT = 36
export const ROW_HEIGHT = 34

// A grouped proposal gains a second header row above the titles, pushing them
// and every row down. Matches GROUP_HEADER_HEIGHT in features/table/table.tsx.
export const GROUP_HEADER_HEIGHT = 24

// Wide enough to keep every column inside the horizontal fold, which the
// coordinate helpers and columnTitles need, and above Mantine's `sm`
// breakpoint, below which the tab bar hides.
export const WIDE_VIEWPORT = { width: 1600, height: 900 }

export type Box = { x: number; y: number; width: number; height: number }
export type Cell = { col: number; row: number }
export type Point = { x: number; y: number }

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

// Everything below the group row starts this far down. Callers derive `grouped`
// from the example under test rather than deciding it per call.
function headerTop(grouped: boolean): number {
  return grouped ? GROUP_HEADER_HEIGHT : 0
}

// The title of a column, below the group row if there is one.
export function headerPoint(
  box: Box,
  { col, grouped = false }: { col: number; grouped?: boolean }
) {
  return {
    x: columnCenter(box, col),
    y: box.y + headerTop(grouped) + HEADER_HEIGHT / 2,
  }
}

// The group box above a column, on a proposal that has groups. The row spans
// the full width, so an ungrouped column has a box too, blank and inert. With
// no groups at all Glide paints no row and this point lands in the titles.
export function groupHeaderPoint(box: Box, col: number) {
  return { x: columnCenter(box, col), y: box.y + GROUP_HEADER_HEIGHT / 2 }
}

// Rows start below the header rows; `row` is 0-based.
export function cellPoint(
  box: Box,
  { col, row, grouped = false }: Cell & { grouped?: boolean }
) {
  return {
    x: columnCenter(box, col),
    y:
      box.y +
      headerTop(grouped) +
      HEADER_HEIGHT +
      row * ROW_HEIGHT +
      ROW_HEIGHT / 2,
  }
}

export type Axis = 'horizontal' | 'vertical'

// The element that carries the grid's scrollbars, which occupy the strip
// between its client box and its border box. One owner: the class tracks Glide.
export function gridScroller(page: Page): Locator {
  return page.locator('.dvn-scroller')
}

// The grid mounts its scroller before the padders give it a scroll range, so an
// early read can land on a grid that cannot scroll yet. Poll this.
export async function canScroll(page: Page, axis: Axis): Promise<boolean> {
  const track = await readTrack(gridScroller(page), axis)
  return track.scroll > track.client
}

// The centre of a scrollbar thumb, in page coordinates, ready for page.mouse.
export async function scrollbarThumb(page: Page, axis: Axis): Promise<Point> {
  const scroller = gridScroller(page)
  await expect(scroller).toBeVisible()
  await expect.poll(() => canScroll(page, axis)).toBe(true)

  const track = await readTrack(scroller, axis)
  if (track.thickness === 0) {
    throw new Error(
      `the ${axis} scrollbar takes no layout space, so it cannot be pressed; launch the browser without --hide-scrollbars`
    )
  }

  const length = (track.client * track.client) / track.scroll
  const along = (track.offset / track.scroll) * track.client + length / 2
  return axis === 'horizontal'
    ? { x: track.x + along, y: track.y + track.height - track.thickness / 2 }
    : { x: track.x + track.width - track.thickness / 2, y: track.y + along }
}

function readTrack(scroller: Locator, axis: Axis) {
  return scroller.evaluate((element: HTMLElement, along: Axis) => {
    const sideways = along === 'horizontal'
    const { x, y, width, height } = element.getBoundingClientRect()
    return {
      x,
      y,
      width,
      height,
      thickness: sideways
        ? element.offsetHeight - element.clientHeight
        : element.offsetWidth - element.clientWidth,
      client: sideways ? element.clientWidth : element.clientHeight,
      scroll: sideways ? element.scrollWidth : element.scrollHeight,
      offset: sideways ? element.scrollLeft : element.scrollTop,
    }
  }, axis)
}
