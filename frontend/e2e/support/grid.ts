import { expect, type Locator, type Page } from '@playwright/test'

// The grid is a Glide <canvas>. Actions that must reach Glide's canvas mouse
// handler (hover, context menu, cell/column selection, activation) are driven by
// real pointer coordinates: the accessibility mirror has no layout box, so it
// never receives these events. These helpers turn an a11y column/row index into
// a canvas point.
//
// COLUMN_WIDTH matches the width the gridColumns memo sets, and HEADER_HEIGHT
// and ROW_HEIGHT the heights the table passes, in features/table/table.tsx.
// ROW_MARKER_WIDTH is Glide's auto width for a clickable-number marker at this
// row count (<=100 rows -> 32).
// The math assumes no horizontal scroll and that the nav and aside are collapsed
// so the grid spans the viewport, so `col` must be within the painted horizontal
// fold and `row` within the initial vertical fold.
export const ROW_MARKER_WIDTH = 32
export const COLUMN_WIDTH = 100
export const HEADER_HEIGHT = 30
export const ROW_HEIGHT = 30

// A grouped proposal gains a second header row above the titles, pushing them
// and every row down. Matches GROUP_HEADER_HEIGHT in features/table/table.tsx.
export const GROUP_HEADER_HEIGHT = 24

// Wide enough to keep every column inside the horizontal fold beside the
// expanded 280px nav, which the coordinate helpers and columnTitles need.
export const WIDE_VIEWPORT = { width: 1840, height: 900 }

// Headless Chromium hides scrollbars by default, leaving only overlay ones,
// which take no layout space. Spread into the `test.use` of specs that need one.
export const REAL_SCROLLBARS = {
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
}

// The columns the table pins, in the order it pins them. Mirrors the store's
// columnPinning.start seed.
const PINNED_COLUMNS = ['proposal', 'run']

// Every coordinate helper here maps a variable's position in meta order to the
// column the grid draws. The app pins columns by pulling them to the front, so
// that mapping only holds while the pinned columns already lead the metadata.
// They do today, which is why nothing converts between the two orders; this
// fails loudly if a fixture ever changes that, rather than silently pointing
// every helper one column off.
export function assertDrawnInMetaOrder(order: string[]) {
  const pinned = PINNED_COLUMNS.filter((name) => order.includes(name))
  const leading = order.slice(0, pinned.length)
  if (pinned.some((name, index) => leading[index] !== name)) {
    throw new Error(
      `the example pins [${pinned.join(', ')}] but leads with ` +
        `[${leading.join(', ')}]; the grid draws the pinned columns first, so ` +
        `meta order is no longer the drawn order`
    )
  }
}

// The a11y grid column of a variable: its index in meta order, offset by one for
// the row-marker column. Holds because no example carries an EXCLUDED_VARIABLE.
export function columnIndex(order: string[], name: string): number {
  assertDrawnInMetaOrder(order)
  const index = order.indexOf(name)
  if (index === -1) {
    throw new Error(
      `'${name}' is not a column in the example; update the fixture or the demo data`
    )
  }
  return index + 1
}

export type Box = { x: number; y: number; width: number; height: number }
export type Cell = { col: number; row: number }
export type Point = { x: number; y: number }

// Opening a plot switches to its view, which unmounts the table, so the
// canvas may be absent when a later grid action runs. Wait for it before reading
// its box.
export async function gridBox(page: Page): Promise<Box> {
  const canvas = gridCanvas(page)
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

// The seam a resize gesture aims at: the right edge of `col` on the title row.
export function headerEdgePoint(
  box: Box,
  options: { col: number; grouped?: boolean }
) {
  const point = headerPoint(box, options)
  return { ...point, x: point.x + COLUMN_WIDTH / 2 }
}

// Three quarters across a column, clear of both its seams. A column collapsed
// to Glide's 50px minimum no longer reaches here.
export function threeQuartersAcross(box: Box, col: number): number {
  return columnCenter(box, col) + COLUMN_WIDTH * 0.25
}

// Glide pairs up any two mouse-ups less than this apart, wherever on the grid
// they land, and calls the second one a double click.
const DOUBLE_CLICK_WINDOW = 500

// A gesture that follows a click too soon arrives as a double click, which over
// a header edge means the fit.
export async function waitOutDoubleClick(page: Page) {
  await page.waitForTimeout(DOUBLE_CLICK_WINDOW)
}

// Glide tracks a drag through the raw mouse moves, so it has to travel in steps
// rather than jump. `hold` waits that long before releasing.
export async function dragBy(
  page: Page,
  { from, by, hold = 0 }: { from: Point; by: Point; hold?: number }
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  if (hold > 0) {
    await page.waitForTimeout(hold)
  }
  await page.mouse.up()
}

// The group box above a column, on a proposal that has groups. The row spans
// the full width, so an ungrouped column has a box too, blank and inert. With
// no groups at all Glide paints no row and this point lands in the titles.
export function groupHeaderPoint(box: Box, col: number) {
  return { x: columnCenter(box, col), y: box.y + GROUP_HEADER_HEIGHT / 2 }
}

// Rows start below the header rows; `row` is 0-based.
function rowCenter(box: Box, row: number, grouped: boolean): number {
  return (
    box.y +
    headerTop(grouped) +
    HEADER_HEIGHT +
    row * ROW_HEIGHT +
    ROW_HEIGHT / 2
  )
}

export function cellPoint(
  box: Box,
  { col, row, grouped = false }: Cell & { grouped?: boolean }
) {
  return { x: columnCenter(box, col), y: rowCenter(box, row, grouped) }
}

// The row's marker, which Glide draws left of the first column. `columnCenter`
// starts at the first data column, so the marker needs an x of its own.
export function rowMarkerPoint(
  box: Box,
  { row, grouped = false }: { row: number; grouped?: boolean }
) {
  return { x: box.x + ROW_MARKER_WIDTH / 2, y: rowCenter(box, row, grouped) }
}

export type Axis = 'horizontal' | 'vertical'

// Glide's canvas, which draws the grid and holds its keyboard focus. One owner:
// the test id tracks Glide.
export function gridCanvas(page: Page): Locator {
  return page.getByTestId('data-grid-canvas')
}

// How far the canvas pixel at `point` sits under the one to its right, on the
// red channel: how strong a vertical line is there. Glide's scroll shadow is
// not on the canvas, so it never counts.
export async function lineStrength(page: Page, point: Point): Promise<number> {
  return gridCanvas(page).evaluate((canvas: HTMLCanvasElement, { x, y }) => {
    const rect = canvas.getBoundingClientRect()
    const scale = canvas.width / rect.width
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('the grid canvas has no 2d context')
    }
    const [here, right] = [x, x + 1].map(
      (px) =>
        context.getImageData(
          Math.round((px - rect.x) * scale),
          Math.round((y - rect.y) * scale),
          1,
          1
        ).data[0]
    )
    return right - here
  }, point)
}

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
