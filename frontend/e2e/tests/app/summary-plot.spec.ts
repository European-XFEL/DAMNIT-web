import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'

import { XPCS } from '#examples/xpcs'
import { openProposal } from '#support/table'
import {
  closeTab,
  openSummaryPlot,
  plotFigure,
  plotTab,
  selectColumns,
} from '#support/plots'

// A wide viewport keeps the target columns within the horizontal fold so the
// coordinate header clicks land on them.
test.use({ viewport: { width: 1600, height: 900 } })

// The a11y column index of a variable: its position in meta order, plus one for
// the row-marker column. A rename or reorder fails here loudly.
function columnOf(name: string): number {
  const index = Object.keys(XPCS.meta.variables).indexOf(name)
  if (index === -1) {
    throw new Error(`'${name}' is not a column in the example`)
  }
  return index + 1
}

// The example's numeric variables, in meta order, excluding Run. dtype lives on
// the run data, not the metadata. The first two drive the plots below.
const numberVars = Object.keys(XPCS.meta.variables).filter(
  (name) => name !== 'run' && XPCS.data[0].variables[name]?.dtype === 'number'
)
const [xVar, yVar] = numberVars
const xTitle = XPCS.meta.variables[xVar].title
const yTitle = XPCS.meta.variables[yVar].title

// Opening a summary plot switches to the Plots tab, which unmounts the table.
// Return to the Table tab between plots so the next header click has a canvas.
async function openSummaryPlots(page: Page, cols: number[]) {
  for (const [index, col] of cols.entries()) {
    if (index > 0) {
      await page.getByRole('tab', { name: 'Table' }).click()
    }
    await openSummaryPlot(page, { col })
  }
}

test('right-clicking a variable header and choosing "Plot: summary" plots it against Run', async ({
  page,
}) => {
  await openProposal(page)

  await openSummaryPlot(page, { col: columnOf(xVar) })

  await expect(plotTab(page, `Summary: ${xTitle} vs. Run`)).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('selecting two variable headers plots the right-clicked one against the other', async ({
  page,
}) => {
  await openProposal(page)

  await selectColumns(page, [columnOf(xVar), columnOf(yVar)])
  // The right-clicked column is the Y axis, the other is X.
  await openSummaryPlot(page, { col: columnOf(yVar) })

  await expect(plotTab(page, `Summary: ${yTitle} vs. ${xTitle}`)).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('closing one plot removes it and leaves the other open', async ({
  page,
}) => {
  await openProposal(page)
  await openSummaryPlots(page, [columnOf(xVar), columnOf(yVar)])

  const first = plotTab(page, `Summary: ${xTitle} vs. Run`)
  const second = plotTab(page, `Summary: ${yTitle} vs. Run`)
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()

  await closeTab(page, `Summary: ${xTitle} vs. Run`)

  await expect(first).toHaveCount(0)
  await expect(second).toBeVisible()
})

test('closing the Plots tab discards the plots and returns to the table', async ({
  page,
}) => {
  await openProposal(page)
  await openSummaryPlots(page, [columnOf(xVar), columnOf(yVar)])
  await expect(plotTab(page, 'Plots')).toBeVisible()

  await closeTab(page, 'Plots')

  await expect(plotTab(page, 'Plots')).toHaveCount(0)
  await expect(page.getByTestId('data-grid-canvas')).toBeVisible()
})
