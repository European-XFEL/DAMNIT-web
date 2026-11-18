import { test, expect } from '#fixtures/production'
import { XPCS } from '#examples/xpcs'
import { openExample } from '#support/demo'
import { openPreviewPlot, plotEntry, plotFigure } from '#support/plots'
import { columnOf, titleOf } from '#support/table'

// A 1-D array preview, which Plotly draws as a scatter.
const SCATTER_VAR = 'xgm_intensity'

test('right-clicking a cell and choosing "Plot: preview" plots its preview data', async ({
  page,
}) => {
  await openExample(page, 'xpcs')

  await openPreviewPlot(page, {
    example: XPCS,
    col: columnOf(XPCS, SCATTER_VAR),
    row: 0,
  })

  await expect(plotEntry(page, titleOf(XPCS, SCATTER_VAR))).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})
