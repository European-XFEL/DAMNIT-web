import { test, expect } from '@damnit-frontend/testing/playwright/production'
import { openExample } from '#tests/e2e/support/demo'
import {
  openPreviewPlot,
  plotEntry,
  plotFigure,
} from '@damnit-frontend/testing/playwright/plots'
import { columnOf, titleOf } from '#tests/e2e/support/example'

// A 1-D array preview, which draws as a line.
const LINE_VAR = 'xgm_intensity'

test('right-clicking a cell and choosing "Plot: preview" plots its preview data', async ({
  page,
}) => {
  await openExample(page, 'xpcs')

  await openPreviewPlot(page, {
    col: columnOf(LINE_VAR),
    row: 0,
  })

  await expect(plotEntry(page, titleOf(LINE_VAR))).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})
