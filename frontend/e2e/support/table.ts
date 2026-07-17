import { expect, type Locator, type Page } from '@playwright/test'

import { XPCS, accessibleProposals, type Example } from '#examples/xpcs'
import { cellPoint, gridBox, headerPoint } from '#support/grid'

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
const CELL_TESTID_PREFIX = 'glide-cell-'

function cellTestId({ col, row }: { col: number; row: number }): string {
  return `${CELL_TESTID_PREFIX}${col}-${row}`
}

// Every mirrored data cell, for asserting an empty grid. Shares cellTestId's
// single owner so the testid format stays in one place.
export function dataCells(page: Page): Locator {
  return page.locator(`[data-testid^="${CELL_TESTID_PREFIX}"]`)
}

// A single mirrored cell by its a11y column/row index (row marker 0, Run 1).
// Shares cellTestId so the testid format stays in one place.
export function cell(
  page: Page,
  { col, row }: { col: number; row: number }
): Locator {
  return page.getByTestId(cellTestId({ col, row }))
}

// Wait for a cell's deferred data to load. Glide mirrors a loaded error or image
// cell as non-empty accessibility text; ordinary cells stay empty, so only call
// this for a cell that mirrors content.
export async function waitForCellLoaded(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  await expect(cell(page, { col, row })).not.toBeEmpty()
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

// Navigate to a dashboard and wait for its grid to paint and its cell data to
// land. Callers pass the navigation itself, so this covers both a direct goto
// and a click through the home list.
export async function openDashboard(
  page: Page,
  navigate: () => Promise<unknown>
) {
  const tableData = waitForTableData(page)
  await navigate()
  await expect(page.getByTestId('data-grid-canvas')).toBeVisible()
  await tableData
}

export async function openProposal(page: Page, example: Example) {
  // openProposal navigates to proposalMetadata[0], so the example's own user
  // must be able to access it or the dashboard silently redirects to
  // /not-found. Fail loudly here, scoped to the specs that actually open one.
  const proposal = example.proposalMetadata[0].number
  if (!accessibleProposals(example).includes(proposal)) {
    throw new Error(
      `proposalMetadata[0] (${proposal}) is not accessible to this example's ` +
        `user; update its userInfo or proposalMetadata so openProposal lands ` +
        `on an accessible proposal`
    )
  }

  await openDashboard(page, () => page.goto(`proposal/${proposal}`))
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
  const runCell = cell(page, { col: RUN_COLUMN, row })
  await expect(runCell).toBeAttached()
  // Shift+Space is Glide's selectRow keybinding: it selects the focused cell's
  // row, so the column is irrelevant.
  await runCell.focus()
  await page.keyboard.press('Shift+Space')
}

// The aside's Run tab, whose title becomes `Run: <n>` once a run is selected.
// This is the primary downstream signal that a grid selection took effect.
export function selectedRunTab(page: Page): Locator {
  return page.getByRole('tab', { name: /Run:\s*\d+/ })
}

// Hover a cell by real pointer coordinates over the canvas. Selection can go
// through the a11y mirror, but the hover tooltip fires from Glide's canvas mouse
// callback, which the layout-box-less mirror never receives. `col` is the a11y
// column index (row marker is 0, Run is 1), matching selectRun.
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

  const box = await gridBox(page)
  const header = headerPoint(box, col)
  const cell = cellPoint(box, { col, row })
  // Rest on the header first so the move onto the cell always reads as a hover
  // transition, then settle on the cell center for the open delay to elapse.
  await page.mouse.move(header.x, header.y)
  await page.mouse.move(cell.x, cell.y)
}

// Right-click a cell by real pointer coordinates, mirroring hoverCell. Glide's
// context menu fires from the canvas mouse callback, so the click must land on
// the cell center rather than going through the a11y mirror.
export async function rightClickCell(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  const box = await gridBox(page)
  const { x, y } = cellPoint(box, { col, row })
  await page.mouse.click(x, y, { button: 'right' })
}

// Activate a cell by double-clicking it, the gesture that narrows the sidebar to
// just that cell's variable. Like rightClickCell this drives real pointer
// coordinates over the canvas, because onCellActivated fires from Glide's canvas
// mouse handler: focusing the a11y mirror selects the row but never carries the
// column through to activation.
export async function activateCell(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  const box = await gridBox(page)
  const { x, y } = cellPoint(box, { col, row })
  await page.mouse.dblclick(x, y)
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
