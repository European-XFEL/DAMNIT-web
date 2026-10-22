import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { numberVars, XPCS, type Example } from '#examples/xpcs'
import { fullMetadata } from '#mocks'
import { gridCanvas, WIDE_VIEWPORT } from '#support/grid'
import { columnOf, openProposal, titleOf } from '#support/table'
import { showTable, statusBar } from '#support/dashboard'
import {
  closePlot,
  openSummaryPlot,
  plotEntries,
  plotEntry,
  plotFigure,
  selectColumns,
} from '#support/plots'

// The mock computed run 13, the newest, at 22:25:20 UTC on 14 November 2023,
// more than a week ago, so the bar shows its date.
test.use({ viewport: WIDE_VIEWPORT, timezoneId: 'UTC' })

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

// Guards our plotly.js fix for font names with a word that starts with a
// digit (patches/README.md). Drop the fix only once this passes without it.
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

test('a summary plot says when its newest data was computed', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await openSummaryPlot(page, { example, col: columnOf(example, xVar) })
  const computed = statusBar(page).getByText('Computed: 14 November 2023')

  // The newest run sets the time
  await expect(computed).toBeVisible()
  await computed.hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    'Computed 14 November 2023 at 22:25:20'
  )

  // Run 1 is computed again, to the same value
  const run1 = example.data.find((run) => run.variables.run.value === 1)!
  const change = {
    1: {
      [xVar]: {
        ...run1.variables[xVar],
        computed_at: Date.UTC(2023, 11, 1, 9, 30),
      },
    },
  }
  api.editRuns(change)
  api.pushLatestData({
    metadata: fullMetadata(example.meta, example.meta.runs),
    runs: change,
  })

  const recomputed = statusBar(page).getByText('Computed: 1 December 2023')
  await expect(recomputed).toBeVisible()
  await recomputed.hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    'Computed 1 December 2023 at 09:30:00'
  )
})
