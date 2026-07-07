import { expect, type Locator, type Page } from '@playwright/test'

// Grid interactions that must reach Glide's canvas mouse handler (the context
// menus, column and cell selection) are driven by real pointer coordinates: the
// accessibility mirror has no layout box, so it never receives these events.
// COLUMN_WIDTH matches formatColumns (width: 100) in features/table/table.tsx.
// HEADER_HEIGHT and ROW_HEIGHT are Glide's defaults; ROW_MARKER_WIDTH is Glide's
// auto width for a clickable-number marker at this row count (<=100 rows -> 32).
const ROW_MARKER_WIDTH = 32
const COLUMN_WIDTH = 100
const HEADER_HEIGHT = 36
const ROW_HEIGHT = 34

// Opening a plot switches to the Plots tab, which unmounts the table, so the
// canvas may be absent when a later grid action runs. Wait for it before
// reading its box.
async function gridBox(page: Page) {
  const canvas = page.getByTestId('data-grid-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('grid canvas has no bounding box')
  }
  return box
}

// Horizontal center of a column. `col` is the a11y column index: row marker 0,
// Run 1, first variable 2.
function columnCenter(box: { x: number; width: number }, col: number) {
  const x =
    box.x + ROW_MARKER_WIDTH + (col - 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2
  if (x > box.x + box.width) {
    throw new Error(
      `column ${col} center (${x}) is outside the grid width ${box.width}; is the aside open?`
    )
  }
  return x
}

async function headerPoint(page: Page, col: number) {
  const box = await gridBox(page)
  return { x: columnCenter(box, col), y: box.y + HEADER_HEIGHT / 2 }
}

// Center of a data cell. Rows start below the fixed header; `row` is 0-based.
async function cellPoint(
  page: Page,
  { col, row }: { col: number; row: number }
) {
  const box = await gridBox(page)
  return {
    x: columnCenter(box, col),
    y: box.y + HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2,
  }
}

export async function rightClickHeader(page: Page, col: number) {
  const { x, y } = await headerPoint(page, col)
  await page.mouse.click(x, y, { button: 'right' })
}

// Click the first point, then modifier-click the rest to build a multi-select.
// Glide reads Cmd on macOS and Ctrl elsewhere; ControlOrMeta lets Playwright
// send the modifier the current platform expects, so this works on every host.
async function multiClick(page: Page, points: { x: number; y: number }[]) {
  const [first, ...rest] = points
  await page.mouse.click(first.x, first.y)

  await page.keyboard.down('ControlOrMeta')
  for (const point of rest) {
    await page.mouse.click(point.x, point.y)
  }
  await page.keyboard.up('ControlOrMeta')
}

// Left-click the first header, then modifier-click the rest to build a
// multi-column selection. The right-clicked column becomes the summary plot's
// Y axis.
export async function selectColumns(page: Page, cols: number[]) {
  const points = await Promise.all(cols.map((col) => headerPoint(page, col)))
  await multiClick(page, points)
}

// Right-click a header and pick "Plot: summary". Scope the click to the menu:
// a bare "Plot" also matches the toolbar's "Display Plot" button.
export async function openSummaryPlot(page: Page, { col }: { col: number }) {
  await rightClickHeader(page, col)
  const menu = page.locator('.mantine-contextmenu')
  await menu.getByText('Plot: summary').click()
}

type Cell = { col: number; row: number }

export async function rightClickCell(page: Page, cell: Cell) {
  const { x, y } = await cellPoint(page, cell)
  await page.mouse.click(x, y, { button: 'right' })
}

// Left-click the first cell, then modifier-click the rest to build a multi-run
// range. The cells must share one column, or the grid clears the range stack.
export async function selectCells(page: Page, cells: Cell[]) {
  const points = await Promise.all(cells.map((cell) => cellPoint(page, cell)))
  await multiClick(page, points)
}

// Right-click a cell and pick "Plot: data". Right-clicking a cell that is not
// already selected resets the selection to it, so build any multi-run range
// with selectCells first, then right-click one of the selected cells.
export async function openDataPlot(page: Page, cell: Cell) {
  await rightClickCell(page, cell)
  const menu = page.locator('.mantine-contextmenu')
  await menu.getByText('Plot: data').click()
}

// The plot dialog ("Display Plot" -> "Plot Settings" modal). Returns the dialog
// locator so callers scope field interactions to it.
export async function openPlotDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Display Plot' }).click()
  const dialog = page.getByRole('dialog', { name: 'Plot Settings' })
  await expect(dialog).toBeVisible()
  return dialog
}

// Pick a variable in one of the dialog's comboboxes (X-axis, Y-axis, Variable):
// type its title to filter the options, then click the match.
export async function chooseVariable(
  dialog: Locator,
  { label, title }: { label: string; title: string }
) {
  const input = dialog.getByLabel(label)
  await input.click()
  await input.fill(title)
  await dialog.getByRole('option', { name: title }).click()
}

// Submit the dialog. Exact match keeps it off the toolbar's "Display Plot".
export async function submitPlot(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Plot', exact: true }).click()
}

// Plot tabs are ordinary DOM: the inner "Summary: ..." tabs and the outer
// "Plots" main tab. The inner tab title spans two lines (label + runs
// subtitle), so match on the accessible name rather than exact text.
export function plotTab(page: Page, name: string | RegExp): Locator {
  return page.getByRole('tab', { name })
}

// Both the inner plot tabs and the outer Plots tab carry a single close icon
// (the only svg in the tab), wired to removePlot / removeTab respectively.
export async function closeTab(page: Page, name: string | RegExp) {
  await plotTab(page, name).locator('svg').click()
}

// plotly.js tags its graph div with the js-plotly-plot class. react-plotly.js
// drops the data-testid we pass, so match the class, not a test id.
export function plotFigure(page: Page): Locator {
  return page.locator('.js-plotly-plot')
}
