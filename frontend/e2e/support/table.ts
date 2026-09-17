import { expect, type Locator, type Page } from '@playwright/test'

import { accessibleProposals, type Example } from '#examples/xpcs'
import {
  type Cell,
  cellPoint,
  columnIndex,
  gridBox,
  gridCanvas,
  groupHeaderPoint,
  headerEdgePoint,
  headerPoint,
  type Point,
  rowMarkerPoint,
} from '#support/grid'

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
  await expect(gridCanvas(page)).toBeVisible()
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

export function columnOf(example: Example, name: string): number {
  return columnIndex(Object.keys(example.meta.variables), name)
}

// The display title the table header and plot entries render for a variable.
export function titleOf(example: Example, name: string): string {
  return example.meta.variables[name].title
}

// The example's trailing variable, which the table draws as its last column.
export function lastVariableOf(example: Example): string {
  const names = Object.keys(example.meta.variables)
  return names[names.length - 1]
}

// A grouped proposal draws a second header row, which pushes every point below
// it down. Read from the example, so hiding every grouped column leaves this
// saying true after Glide has dropped the row: it enables the row from the
// visible columns, not from the metadata.
export function hasGroups(example: Example): boolean {
  return Object.keys(example.meta.groups ?? {}).length > 0
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

// Every mirrored header title, left to right. The mirror renders a beat after
// the canvas, so wait for the row before reading it or an early call comes back
// empty. Same viewport caveat as columnHeader: these are the on-screen columns,
// not every column.
export async function columnTitles(page: Page): Promise<string[]> {
  const headers = page.locator('[role="columnheader"]')
  await expect(headers.first()).toBeAttached()
  return headers.allInnerTexts()
}

// Glide repaints its mirror a beat after the store changes, so poll the drawn
// order. Only the leading columns count: the mirror stops at the viewport.
export async function expectLeadingColumns(page: Page, titles: string[]) {
  await expect
    .poll(async () => (await columnTitles(page)).slice(0, titles.length))
    .toEqual(titles)
}

// The mirrored headers of the selected columns. Selection is painted on the
// canvas, but Glide also carries it into the mirror as aria-selected, which is
// the only way a test can read it.
export function selectedColumnHeaders(page: Page): Locator {
  return page.locator('[role="columnheader"][aria-selected="true"]')
}

// A width never reaches the accessibility mirror, so it is read back by clicking
// a point and asking which column answered. Keep probes 5px clear of a seam.
export async function clickAndExpectColumn(
  page: Page,
  { point, title }: { point: Point; title: string }
) {
  await page.mouse.click(point.x, point.y)
  await expect(selectedColumnHeaders(page)).toHaveText([title])
}

// The seam a resize gesture aims at, on the example's own title row. `overshoot`
// pushes it into the strip of dead space Glide leaves beside the last column.
export async function headerEdge(
  page: Page,
  {
    example,
    col,
    overshoot = 0,
  }: { example: Example; col: number; overshoot?: number }
): Promise<Point> {
  const box = await gridBox(page)
  const { x, y } = headerEdgePoint(box, { col, grouped: hasGroups(example) })
  return { x: x + overshoot, y }
}

// The grid's right-click menu. One owner: the class tracks Mantine's.
export function contextMenu(page: Page): Locator {
  return page.locator('.mantine-contextmenu')
}

// Right-click a column title by real pointer coordinates, mirroring
// rightClickCell.
export async function rightClickHeader(
  page: Page,
  { example, col }: { example: Example; col: number }
) {
  const box = await gridBox(page)
  const { x, y } = headerPoint(box, { col, grouped: hasGroups(example) })
  await page.mouse.click(x, y, { button: 'right' })
}

// Click the group box above a column, on a grouped proposal. Like hoverCell
// this drives real pointer coordinates: the group row is painted on the canvas
// and has no mirrored element to click.
export async function clickGroupHeader(page: Page, col: number) {
  const box = await gridBox(page)
  const { x, y } = groupHeaderPoint(box, col)
  await page.mouse.click(x, y)
}

// Opens a Variables/Tags popover from its toolbar button, returning the button
// so tests can assert its count badge afterwards.
export async function openPopover(page: Page, name: string): Promise<Locator> {
  const button = page.getByRole('button', { name })
  await button.click()
  return button
}

// The checkbox that shows a column or selects a tag. Each is named for the row
// it sits in, which is the only part of a row either popover lets a test name.
export function rowCheckbox(page: Page, name: string): Locator {
  return page.getByRole('checkbox', { name, exact: true })
}

// The link that shows or hides a whole group at once. Its name carries the
// group's, since every one of these links reads "Hide all" on screen.
export function groupAction(page: Page, name: string): Locator {
  return page.getByRole('button', { name: `all ${name}` })
}

// The handle that lifts a column or a group. Only a row an order governs has
// one, so a pinned row is absent from this by construction.
export function columnHandle(page: Page, name: string): Locator {
  return page.getByRole('button', { name: `Reorder ${name}`, exact: true })
}

// What a column opens when its title is pressed. Tags are all there is to
// show, so an untagged column has no such button at all.
export function columnDisclosure(page: Page, name: string): Locator {
  return page
    .locator('.mantine-Popover-dropdown')
    .getByRole('button', { name, exact: true })
}

// Space lifts, each arrow moves one place, space drops: the library's keyboard
// drag, and the only one a test can drive without coordinates.
export async function dragColumn(
  page: Page,
  {
    name,
    key,
    places = 1,
  }: { name: string; key: 'ArrowUp' | 'ArrowDown'; places?: number }
) {
  await columnHandle(page, name).focus()
  await page.keyboard.press('Space')
  for (let step = 0; step < places; step++) {
    await page.keyboard.press(key)
  }
  await page.keyboard.press('Space')
}

// The popover's own show/hide-all link, above the list. The group links read
// the same on screen, so this matches the one that names no group.
export function popoverAction(page: Page): Locator {
  return page.getByRole('button', { name: /^(Hide|Show) all$/ })
}

// The details a column opens, found through the button that controls them.
export async function rowDetails(page: Page, name: string): Promise<Locator> {
  const id = await columnDisclosure(page, name).getAttribute('aria-controls')
  return page.locator(`[id="${id}"]`)
}

// Click the row's marker, which is Glide's own select-this-row control. Driven
// by real pointer coordinates like the other canvas gestures: focusing the
// mirrored cell and pressing Glide's Shift+Space keybinding does not carry the
// row through, so it selects whichever row Glide already had focused.
// `row` must be within the initial vertical fold; this does not scroll it in.
export async function selectRun(
  page: Page,
  { example, row }: { example: Example; row: number }
) {
  // The a11y tree renders a beat after the canvas, and Glide only mirrors rows
  // in the current vertical window, so wait for the target row to exist.
  await expect(cell(page, { col: RUN_COLUMN, row })).toBeAttached()

  const box = await gridBox(page)
  const { x, y } = rowMarkerPoint(box, { row, grouped: hasGroups(example) })
  await page.mouse.click(x, y)
}

// The mirrored row of a highlighted run, the row half of the aria-selected
// mirror selectedColumnHeaders reads on the column side. Glide numbers the
// header row 1, so data row `row` is `row + 2`.
export function highlightedRow(page: Page, { row }: { row: number }): Locator {
  return page.locator(
    `[role="row"][aria-rowindex="${row + 2}"][aria-selected="true"]`
  )
}

// Close the aside from its X, named after the run it closes.
export function closeAside(page: Page) {
  return page
    .getByRole('complementary')
    .getByRole('button', { name: /^Close run \d+$/ })
    .click()
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
  {
    example,
    col,
    row,
    waitForContent = true,
  }: Cell & { example: Example; waitForContent?: boolean }
) {
  // The deferred table data loads after the canvas paints, so the target cell
  // can still be empty when the pointer arrives, and hovering an empty cell
  // schedules no tooltip. Error and image cells mirror content, so gate on that;
  // ordinary cells stay empty, so a hover aimed at one must opt out.
  if (waitForContent) {
    await waitForCellLoaded(page, { col, row })
  }

  const box = await gridBox(page)
  const grouped = hasGroups(example)
  const header = headerPoint(box, { col, grouped })
  const cell = cellPoint(box, { col, row, grouped })
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
  { example, col, row }: Cell & { example: Example }
) {
  const box = await gridBox(page)
  const { x, y } = cellPoint(box, { col, row, grouped: hasGroups(example) })
  await page.mouse.click(x, y, { button: 'right' })
}

// Activate a cell by double-clicking it, the gesture that narrows the sidebar to
// just that cell's variable. Like rightClickCell this drives real pointer
// coordinates over the canvas, because onCellActivated fires from Glide's canvas
// mouse handler: focusing the a11y mirror selects the row but never carries the
// column through to activation.
export async function activateCell(
  page: Page,
  { example, col, row }: Cell & { example: Example }
) {
  const box = await gridBox(page)
  const { x, y } = cellPoint(box, { col, row, grouped: hasGroups(example) })
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
