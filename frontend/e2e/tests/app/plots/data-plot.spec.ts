import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import { columnOf, openProposal, titleOf } from '#support/table'
import {
  openDataPlot,
  PLOT_VIEWPORT,
  plotFigure,
  plotTab,
  selectCells,
} from '#support/plots'

test.use({ viewport: PLOT_VIEWPORT })

// Variables chosen for the dtype of their *extracted* data, which differs from
// the scalar shown in the table cell. One per render branch:
const SCATTER_VAR = 'xgm_intensity' // 1-D array -> Plotly scatter
const SCALAR_VAR = 'n_trains' // scalar number -> "unable to display" notice
const IMAGE_VAR = 'xpcs_g2_plot' // png -> plain <img>

test('right-clicking a cell and choosing "Plot: data" plots its extracted data', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openDataPlot(page, { col: columnOf(SCATTER_VAR), row: 0 })

  await expect(plotTab(page, `Data: ${titleOf(SCATTER_VAR)}`)).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('selecting cells from two runs plots both in one figure', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const col = columnOf(SCATTER_VAR)
  // Ctrl-click builds the run range; right-clicking a selected cell plots it.
  await selectCells(page, [
    { col, row: 0 },
    { col, row: 1 },
  ])
  await openDataPlot(page, { col, row: 1 })

  const tab = plotTab(page, `Data: ${titleOf(SCATTER_VAR)}`)
  await expect(tab).toBeVisible()
  await expect(tab).toContainText('run 1-2')
  await expect(plotFigure(page)).toHaveCount(1)
})

test('right-clicking a scalar cell shows the unable-to-display notice', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The extracted value equals the scalar the table already shows for run 1.
  const scalarValue = XPCS.data[0].variables[SCALAR_VAR].value

  await openDataPlot(page, { col: columnOf(SCALAR_VAR), row: 0 })

  await expect(plotTab(page, `Data: ${titleOf(SCALAR_VAR)}`)).toBeVisible()
  await expect(page.getByText('Unable to display the plot')).toBeVisible()
  await expect(page.getByText(/scalar/)).toContainText(String(scalarValue))
})

test('right-clicking a png cell renders the image instead of a figure', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openDataPlot(page, { col: columnOf(IMAGE_VAR), row: 0 })

  await expect(plotTab(page, `Data: ${titleOf(IMAGE_VAR)}`)).toBeVisible()
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  await expect(plotFigure(page)).toHaveCount(0)
})
