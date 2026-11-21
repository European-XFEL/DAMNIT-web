import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  openPreviewPlot,
  plotEntry,
  plotFigure,
} from '@damnit-frontend/testing/playwright/plots'
import { columnOfTitle, openMockProposal } from '#tests/e2e/support/real-api'

test("a 2-D array's preview plot draws it as an image of its own shape", async ({
  page,
}) => {
  await openMockProposal(page)

  await openPreviewPlot(page, {
    col: await columnOfTitle(page, 'Detector image'),
    row: 0,
  })

  // The array is 16 rows of 24, so drawn the other way round the axes swap.
  // Rows run down the y axis, as in an image.
  await expect(plotEntry(page, 'Detector image')).toBeVisible()
  const figure = plotFigure(page)
  await expect(figure.locator('g.xtick text')).toHaveText([
    '0',
    '5',
    '10',
    '15',
    '20',
  ])
  await expect(figure.locator('g.ytick text')).toHaveText([
    '15',
    '10',
    '5',
    '0',
  ])
})
