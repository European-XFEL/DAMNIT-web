import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  openSummaryPlot,
  plotEntry,
  plotFigure,
} from '@damnit-frontend/testing/playwright/plots'
import {
  columnOfTitle,
  openMockProposal,
  RUNS,
} from '#tests/e2e/support/real-api'

test('a summary plot draws one point per run', async ({ page }) => {
  await openMockProposal(page)

  await openSummaryPlot(page, {
    col: await columnOfTitle(page, 'Trains'),
  })

  await expect(plotEntry(page, 'Trains vs. Run')).toBeVisible()
  await expect(plotFigure(page).locator('.scatterlayer .point')).toHaveCount(
    RUNS.length
  )
})
