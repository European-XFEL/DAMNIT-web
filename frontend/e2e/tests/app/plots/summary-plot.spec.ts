import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { numberVars, XPCS, type Example } from '#examples/xpcs'
import { gridCanvas, WIDE_VIEWPORT } from '#support/grid'
import { columnOf, openProposal, titleOf } from '#support/table'
import { showTable } from '#support/dashboard'
import {
  closePlot,
  openSummaryPlot,
  plotEntries,
  plotEntry,
  plotFigure,
  selectColumns,
} from '#support/plots'

test.use({ viewport: WIDE_VIEWPORT })

// The first two numeric variables drive the plots below.
const [xVar, yVar] = numberVars
const xTitle = titleOf(XPCS, xVar)
const yTitle = titleOf(XPCS, yVar)

// Opening a summary plot switches to its view, which unmounts the table.
// Return to the table between plots so the next header click has a canvas.
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

  await expect(plotEntry(page, `${xTitle} vs. Run`)).toBeVisible()
  // Summary plots always mount a figure (their table data is never empty here),
  // so this is a render smoke-check; the entry above is the real assertion.
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

  await expect(plotEntry(page, `${yTitle} vs. ${xTitle}`)).toBeVisible()
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

  const first = plotEntry(page, `${xTitle} vs. Run`)
  const second = plotEntry(page, `${yTitle} vs. Run`)
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()

  await closePlot(page, `${xTitle} vs. Run`)

  await expect(first).toHaveCount(0)
  await expect(second).toBeVisible()
})

test('closing the shown plot returns to the table it was opened from', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openSummaryPlot(page, { example, col: columnOf(example, xVar) })
  await expect(plotFigure(page)).toBeVisible()

  await closePlot(page, `${xTitle} vs. Run`)

  await expect(plotEntries(page)).toHaveCount(0)
  await expect(gridCanvas(page)).toBeVisible()
})

test('the camera button downloads the plot as a png', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openSummaryPlot(page, { example, col: columnOf(example, xVar) })
  const figure = plotFigure(page)
  await expect(figure).toBeVisible()

  const download = page.waitForEvent('download')
  await figure.hover()
  await figure.getByRole('button', { name: 'Download plot as a PNG' }).click()

  expect((await download).suggestedFilename()).toMatch(/\.png$/)
})
