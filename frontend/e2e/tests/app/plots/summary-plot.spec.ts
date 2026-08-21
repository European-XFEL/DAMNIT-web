import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { numberVars, XPCS, type Example } from '#examples/xpcs'
import { WIDE_VIEWPORT } from '#support/grid'
import { columnOf, openProposal, titleOf } from '#support/table'
import {
  closeTab,
  openSummaryPlot,
  plotFigure,
  plotTab,
  selectColumns,
  showTable,
} from '#support/plots'

test.use({ viewport: WIDE_VIEWPORT })

// The first two numeric variables drive the plots below.
const [xVar, yVar] = numberVars
const xTitle = titleOf(XPCS, xVar)
const yTitle = titleOf(XPCS, yVar)

// Opening a summary plot switches to the Plots tab, which unmounts the table.
// Return to the Table tab between plots so the next header click has a canvas.
async function openSummaryPlots(
  page: Page,
  { example, cols }: { example: Example; cols: number[] }
) {
  for (const [index, col] of cols.entries()) {
    if (index > 0) {
      await showTable(page)
    }
    await openSummaryPlot(page, { example, col })
  }
}

test('right-clicking a variable header and choosing "Plot: summary" plots it against Run', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openSummaryPlot(page, { example, col: columnOf(example, xVar) })

  await expect(plotTab(page, `Summary: ${xTitle} vs. Run`)).toBeVisible()
  // Summary plots always mount a figure (their table data is never empty here),
  // so this is a render smoke-check; the tab title above is the real assertion.
  await expect(plotFigure(page)).toBeVisible()
})

test('selecting two variable headers plots the right-clicked one against the other', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await selectColumns(page, {
    example,
    cols: [columnOf(example, xVar), columnOf(example, yVar)],
  })
  // The right-clicked column is the Y axis, the other is X.
  await openSummaryPlot(page, { example, col: columnOf(example, yVar) })

  await expect(plotTab(page, `Summary: ${yTitle} vs. ${xTitle}`)).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('closing one plot removes it and leaves the other open', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openSummaryPlots(page, {
    example,
    cols: [columnOf(example, xVar), columnOf(example, yVar)],
  })

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
  example,
}) => {
  await openProposal(page, example)
  await openSummaryPlots(page, {
    example,
    cols: [columnOf(example, xVar), columnOf(example, yVar)],
  })
  await expect(plotTab(page, 'Plots')).toBeVisible()

  await closeTab(page, 'Plots')

  await expect(plotTab(page, 'Plots')).toHaveCount(0)
  await expect(page.getByTestId('data-grid-canvas')).toBeVisible()
})
