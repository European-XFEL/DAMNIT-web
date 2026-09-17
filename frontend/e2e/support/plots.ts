import { expect, type Locator, type Page } from '@playwright/test'

import { type Example } from '#examples/xpcs'
import { dashboardNav } from '#support/dashboard'
import { type Cell, cellPoint, gridBox, headerPoint } from '#support/grid'
import {
  contextMenu,
  hasGroups,
  rightClickCell,
  rightClickHeader,
  titleOf,
} from '#support/table'

// Glide reads Cmd on macOS and Ctrl elsewhere; ControlOrMeta lets Playwright
// send the modifier the current platform expects, so this works on every host.
export async function clickWithModifier(
  page: Page,
  points: { x: number; y: number }[]
) {
  await page.keyboard.down('ControlOrMeta')
  for (const point of points) {
    await page.mouse.click(point.x, point.y)
  }
  await page.keyboard.up('ControlOrMeta')
}

// Click the first point, then modifier-click the rest to build a multi-select.
async function multiClick(page: Page, points: { x: number; y: number }[]) {
  const [first, ...rest] = points
  await page.mouse.click(first.x, first.y)
  await clickWithModifier(page, rest)
}

// The right-clicked column becomes the summary plot's Y axis.
export async function selectColumns(
  page: Page,
  { example, cols }: { example: Example; cols: number[] }
) {
  const box = await gridBox(page)
  const grouped = hasGroups(example)
  await multiClick(
    page,
    cols.map((col) => headerPoint(box, { col, grouped }))
  )
}

// Right-click a header and pick "Plot: summary". Scope the click to the menu:
// a bare "Plot" also matches the nav's "New plot" button.
export async function openSummaryPlot(
  page: Page,
  { example, col }: { example: Example; col: number }
) {
  await rightClickHeader(page, { example, col })
  await contextMenu(page).getByText('Plot: summary').click()
}

// The cells must share one column, or the grid clears the range stack.
export async function selectCells(
  page: Page,
  { example, cells }: { example: Example; cells: Cell[] }
) {
  const box = await gridBox(page)
  const grouped = hasGroups(example)
  await multiClick(
    page,
    cells.map((cell) => cellPoint(box, { ...cell, grouped }))
  )
}

// Right-click a cell and pick "Plot: preview". Right-clicking a cell that is not
// already selected resets the selection to it, so build any multi-run range
// with selectCells first, then right-click one of the selected cells.
export async function openPreviewPlot(
  page: Page,
  { example, col, row }: Cell & { example: Example }
) {
  await rightClickCell(page, { example, col, row })
  await contextMenu(page).getByText('Plot: preview').click()
}

// The plot dialog (the nav's "New plot" -> "Plot Settings" modal). Returns the
// dialog locator so callers scope field interactions to it.
export async function openPlotDialog(page: Page): Promise<Locator> {
  await dashboardNav(page).getByRole('button', { name: 'New plot' }).click()
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

// Submit the dialog. Exact match keeps it off any other "Plot" in the dialog.
export async function submitPlot(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Plot', exact: true }).click()
}

// A plot of one variable against Run, for tests where an open plot is the
// setup rather than the subject. The dialog's X axis already defaults to Run.
export async function plotVariable(
  page: Page,
  { example, variable }: { example: Example; variable: string }
) {
  const dialog = await openPlotDialog(page)
  await chooseVariable(dialog, {
    label: 'Y-axis',
    title: titleOf(example, variable),
  })
  await submitPlot(dialog)
}

// One row per open plot, under the nav's Plots header.
export function plotEntries(page: Page): Locator {
  return dashboardNav(page)
    .getByRole('list', { name: 'Plots' })
    .getByRole('listitem')
}

// A plot's entry names it, then its kind and its runs. Anchoring on the name
// and its comma keeps it off a longer name and off the row's close mark.
function entryName(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped},`)
}

export function plotEntry(page: Page, name: string): Locator {
  return plotEntries(page).getByRole('button', { name: entryName(name) })
}

// Each row has its own mark, shown only on hover or focus. A hidden button is
// not in the accessibility tree, so hover the row first.
export async function closePlot(page: Page, name: string) {
  const entry = plotEntries(page).filter({
    has: page.getByRole('button', { name: entryName(name) }),
  })
  await entry.hover()
  await entry.getByRole('button', { name: /^Close / }).click()
}

// plotly.js tags its graph div with the js-plotly-plot class. react-plotly.js
// drops the data-testid we pass, so match the class, not a test id.
export function plotFigure(page: Page): Locator {
  return page.locator('.js-plotly-plot')
}
