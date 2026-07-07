import { expect, type Locator, type Page } from '@playwright/test'

import { XPCS } from '#examples/xpcs'

// The grid is a <canvas>. Glide Data Grid mirrors the visible columns into a
// <table role="grid"> as canvas fallback content, which the browser never
// paints, so it has no layout box and getByRole would treat it as hidden.
// Helpers that read the grid therefore match on the role attribute; popover
// rows are ordinary painted DOM, so getByRole works for those.

// Source-column index of the frozen Run column (the row-marker column is 0).
// Run is always present and never hidden, so it is the stable selection target.
const RUN_COLUMN = 1

// The testid Glide assigns each mirrored cell. One owner because the format
// tracks Glide's version.
function cellTestId({ col, row }: { col: number; row: number }): string {
  return `glide-cell-${col}-${row}`
}

// Wait for a cell's deferred data to load. Glide mirrors a loaded error or image
// cell as non-empty accessibility text; ordinary cells stay empty, so only call
// this for a cell that mirrors content.
export async function waitForCellLoaded(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  await expect(page.getByTestId(cellTestId({ col, row }))).not.toBeEmpty()
}

// The canvas paints as soon as the metadata loads, but cell values arrive later
// via a separate table-data query. Waiting on that response keeps a cell action
// from firing before its data lands, and lets the api fixture's drift guard see
// it. Start the wait before navigating so the response can't be missed.
export function waitForTableData(page: Page) {
  return page.waitForResponse((response) => {
    if (!response.url().includes('/graphql')) {
      return false
    }
    const { operationName } = (response.request().postDataJSON() ?? {}) as {
      operationName?: string
    }
    return (operationName ?? '').endsWith('TableDataQuery')
  })
}

export async function openProposal(page: Page) {
  const tableData = waitForTableData(page)
  await page.goto(`proposal/${XPCS.proposalMetadata[0].number}`)
  await expect(page.getByTestId('data-grid-canvas')).toBeVisible()
  await tableData
}

// The a11y column index of a variable: its position in meta order, plus one for
// the row-marker column. A rename or reorder fails here loudly.
export function columnOf(name: string): number {
  const index = Object.keys(XPCS.meta.variables).indexOf(name)
  if (index === -1) {
    throw new Error(`'${name}' is not a column in the example`)
  }
  return index + 1
}

// The display title the table header and plot tabs render for a variable.
export function titleOf(name: string): string {
  return XPCS.meta.variables[name].title
}

// aria-colcount is the live data-column count, excluding the row-marker column.
export async function expectVisibleColumns(page: Page, count: number) {
  await expect(page.locator('[role="grid"]')).toHaveAttribute(
    'aria-colcount',
    String(count)
  )
}

// Glide only mirrors headers within the horizontal viewport, so toHaveCount(1)
// means on-screen and toHaveCount(0) means hidden. For whether a column exists
// at all, use expectVisibleColumns.
export function columnHeader(page: Page, title: string): Locator {
  return page.locator('[role="columnheader"]', { hasText: title })
}

// Opens a Variables/Tags popover from its toolbar button, returning the button
// so tests can assert its count badge afterwards.
export async function openPopover(page: Page, name: string): Promise<Locator> {
  const button = page.getByRole('button', { name })
  await button.click()
  return button
}

export function rowCheckbox(page: Page, name: string): Locator {
  return page.getByRole('row', { name }).getByRole('checkbox')
}

// `row` must be within the initial vertical fold; this does not scroll it in.
export async function selectRun(page: Page, { row }: { row: number }) {
  // The a11y tree renders a beat after the canvas, and Glide only mirrors rows
  // in the current vertical window, so wait for the target cell itself.
  const cell = page.getByTestId(cellTestId({ col: RUN_COLUMN, row }))
  await expect(cell).toBeAttached()
  // Shift+Space is Glide's selectRow keybinding: it selects the focused cell's
  // row, so the column is irrelevant.
  await cell.focus()
  await page.keyboard.press('Shift+Space')
}

// The aside's Run tab, whose title becomes `Run: <n>` once a run is selected.
// This is the primary downstream signal that a grid selection took effect.
export function selectedRunTab(page: Page): Locator {
  return page.getByRole('tab', { name: /Run:\s*\d+/ })
}

// Glide sizes the clickable-number row marker by row count; at the demo's row
// count (100 or fewer) it is 32px wide. Cell hovers aim at the column center,
// so the 100px column absorbs any slop and this never has to be exact.
const ROW_MARKER_WIDTH = 32
const COLUMN_WIDTH = 100
const HEADER_HEIGHT = 36
const ROW_HEIGHT = 34

// Hover a cell by real pointer coordinates over the canvas. Selection can go
// through the a11y mirror, but the hover tooltip fires from Glide's canvas mouse
// callback, which the layout-box-less mirror never receives. `col` is the a11y
// column index (row marker is 0, Run is 1), matching selectRun. The math assumes
// no horizontal scroll and that the nav and aside are collapsed so the grid
// spans the viewport, so `col` must be within the painted horizontal fold and
// `row` within the initial vertical fold.
async function cellCenter(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  const box = await page.getByTestId('data-grid-canvas').boundingBox()
  if (!box) {
    throw new Error('grid canvas has no bounding box')
  }
  return {
    x: box.x + ROW_MARKER_WIDTH + (col - 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2,
    y: box.y + HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2,
    header: { x: box.x + COLUMN_WIDTH, y: box.y + HEADER_HEIGHT / 2 },
  }
}

export async function hoverCell(
  page: Page,
  { col, row }: { col: number; row: number },
  { waitForContent = true }: { waitForContent?: boolean } = {}
) {
  // The deferred table data loads after the canvas paints, so the target cell
  // can still be empty when the pointer arrives, and hovering an empty cell
  // schedules no tooltip. Error and image cells mirror content, so gate on that;
  // ordinary cells stay empty, so a hover aimed at one must opt out.
  if (waitForContent) {
    await waitForCellLoaded(page, { col, row })
  }

  const { x, y, header } = await cellCenter(page, { col, row })
  // Rest on the header first so the move onto the cell always reads as a hover
  // transition, then settle on the cell center for the open delay to elapse.
  await page.mouse.move(header.x, header.y)
  await page.mouse.move(x, y)
}

// Right-click a cell by real pointer coordinates, mirroring hoverCell. Glide's
// context menu fires from the canvas mouse callback, so the click must land on
// the cell center rather than going through the a11y mirror.
export async function rightClickCell(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  const { x, y } = await cellCenter(page, { col, row })
  await page.mouse.click(x, y, { button: 'right' })
}

// The hover tooltip renders into the table's #portal container with no role or
// testid, so scope card assertions here and match on text.
export function tooltipCard(page: Page): Locator {
  return page.locator('#portal')
}

// Move the pointer off the grid so an open hover tooltip closes.
export async function moveAway(page: Page) {
  await page.mouse.move(0, 0)
}
