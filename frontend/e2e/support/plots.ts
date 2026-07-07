import { expect, type Locator, type Page } from '@playwright/test'

// Header interactions that must reach Glide's canvas mouse handler (the context
// menu, column selection) are driven by real pointer coordinates: the
// accessibility mirror has no layout box, so it never receives these events.
// The geometry mirrors the fixed column layout in support/table.ts; PR3's
// hoverCell uses the same constants, so fold both into one shared helper once
// they land together.
const ROW_MARKER_WIDTH = 44
const COLUMN_WIDTH = 100
const HEADER_HEIGHT = 36

// Opening a plot switches to the Plots tab, which unmounts the table, so the
// canvas may be absent when a later header action runs. Wait for it before
// reading its box. `col` is the a11y column index: row marker 0, Run 1, first
// variable 2.
async function headerPoint(page: Page, col: number) {
  const canvas = page.getByTestId('data-grid-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('grid canvas has no bounding box')
  }
  return {
    x: box.x + ROW_MARKER_WIDTH + (col - 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2,
    y: box.y + HEADER_HEIGHT / 2,
  }
}

export async function rightClickHeader(page: Page, col: number) {
  const { x, y } = await headerPoint(page, col)
  await page.mouse.click(x, y, { button: 'right' })
}

// Left-click the first header, then Ctrl-click the rest to build a multi-column
// selection. The right-clicked column becomes the summary plot's Y axis.
export async function selectColumns(page: Page, cols: number[]) {
  const [first, ...rest] = cols
  const start = await headerPoint(page, first)
  await page.mouse.click(start.x, start.y)

  await page.keyboard.down('Control')
  for (const col of rest) {
    const point = await headerPoint(page, col)
    await page.mouse.click(point.x, point.y)
  }
  await page.keyboard.up('Control')
}

// Right-click a header and pick "Plot: summary". Scope the click to the menu:
// a bare "Plot" also matches the toolbar's "Display Plot" button.
export async function openSummaryPlot(page: Page, { col }: { col: number }) {
  await rightClickHeader(page, col)
  const menu = page.locator('.mantine-contextmenu')
  await menu.getByText('Plot: summary').click()
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
