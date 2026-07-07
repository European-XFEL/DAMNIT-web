import { test, expect } from '#fixtures'

import { XPCS } from '#examples/xpcs'
import { openProposal } from '#support/table'
import { openDataPlot, plotFigure, plotTab, selectCells } from '#support/plots'

// A wide viewport keeps every column within the horizontal fold so the
// coordinate cell clicks land on them.
test.use({ viewport: { width: 1600, height: 900 } })

// Variables chosen for the dtype of their *extracted* data, which differs from
// the scalar shown in the table cell. One per render branch:
const SCATTER_VAR = 'xgm_intensity' // 1-D array -> Plotly scatter
const SCALAR_VAR = 'n_trains' // scalar number -> "unable to display" notice
const IMAGE_VAR = 'xpcs_g2_plot' // png -> plain <img>

// The a11y column index of a variable: its position in meta order, plus one for
// the row-marker column. A rename or reorder fails here loudly.
function columnOf(name: string): number {
  const index = Object.keys(XPCS.meta.variables).indexOf(name)
  if (index === -1) {
    throw new Error(`'${name}' is not a column in the example`)
  }
  return index + 1
}

function titleOf(name: string): string {
  return XPCS.meta.variables[name].title
}

test('right-clicking a cell and choosing "Plot: data" plots its extracted data', async ({
  page,
}) => {
  await openProposal(page)

  await openDataPlot(page, { col: columnOf(SCATTER_VAR), row: 0 })

  await expect(plotTab(page, `Data: ${titleOf(SCATTER_VAR)}`)).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('selecting cells from two runs plots both in one figure', async ({
  page,
}) => {
  await openProposal(page)

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
}) => {
  await openProposal(page)

  // The extracted value equals the scalar the table already shows for run 1.
  const scalarValue = XPCS.data[0].variables[SCALAR_VAR].value

  await openDataPlot(page, { col: columnOf(SCALAR_VAR), row: 0 })

  await expect(plotTab(page, `Data: ${titleOf(SCALAR_VAR)}`)).toBeVisible()
  await expect(page.getByText('Unable to display the plot')).toBeVisible()
  await expect(page.getByText(/scalar/)).toContainText(String(scalarValue))
})

test('right-clicking a png cell renders the image instead of a figure', async ({
  page,
}) => {
  await openProposal(page)

  await openDataPlot(page, { col: columnOf(IMAGE_VAR), row: 0 })

  await expect(plotTab(page, `Data: ${titleOf(IMAGE_VAR)}`)).toBeVisible()
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  await expect(plotFigure(page)).toHaveCount(0)
})
