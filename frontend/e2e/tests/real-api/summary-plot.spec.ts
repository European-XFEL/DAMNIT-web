import { test, expect } from '#fixtures/production'
import { openSummaryPlot, plotEntry, plotFigure } from '#support/plots'
import {
  ALL_VALUE_TYPES,
  columnOfTitle,
  openMockProposal,
  RUNS,
} from '#support/real-api'

test('a summary plot draws one point per run', async ({ page }) => {
  await openMockProposal(page)

  await openSummaryPlot(page, {
    example: ALL_VALUE_TYPES,
    col: await columnOfTitle(page, 'Trains'),
  })

  await expect(plotEntry(page, 'Trains vs. Run')).toBeVisible()
  await expect(plotFigure(page).locator('.scatterlayer .point')).toHaveCount(
    RUNS.length
  )
})
