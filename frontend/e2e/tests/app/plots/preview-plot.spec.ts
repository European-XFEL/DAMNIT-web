import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import { WIDE_VIEWPORT } from '#support/grid'
import { columnOf, openProposal, titleOf } from '#support/table'
import {
  openPreviewPlot,
  plotFigure,
  plotTab,
  selectCells,
} from '#support/plots'

test.use({ viewport: WIDE_VIEWPORT })

// Variables chosen for the dtype of their *preview* data, which differs from
// the scalar shown in the table cell. One per render branch:
const SCATTER_VAR = 'xgm_intensity' // 1-D array -> Plotly scatter
const SCALAR_VAR = 'n_trains' // scalar number -> "unable to display" notice
const IMAGE_VAR = 'xpcs_g2_plot' // image -> plain <img>

test('right-clicking a cell and choosing "Plot: preview" plots its preview data', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openPreviewPlot(page, {
    example,
    col: columnOf(example, SCATTER_VAR),
    row: 0,
  })

  await expect(
    plotTab(page, `Preview: ${titleOf(example, SCATTER_VAR)}`)
  ).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('selecting cells from two runs plots both in one figure', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const col = columnOf(example, SCATTER_VAR)
  // Ctrl-click builds the run range; right-clicking a selected cell plots it.
  await selectCells(page, {
    example,
    cells: [
      { col, row: 0 },
      { col, row: 1 },
    ],
  })
  await openPreviewPlot(page, { example, col, row: 1 })

  const tab = plotTab(page, `Preview: ${titleOf(example, SCATTER_VAR)}`)
  await expect(tab).toBeVisible()
  await expect(tab).toContainText('run 1-2')
  await expect(plotFigure(page)).toHaveCount(1)
})

test('right-clicking a scalar cell shows the unable-to-display notice', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The preview value equals the scalar the table already shows for run 1.
  const scalarValue = XPCS.data[0].variables[SCALAR_VAR].value

  await openPreviewPlot(page, {
    example,
    col: columnOf(example, SCALAR_VAR),
    row: 0,
  })

  await expect(
    plotTab(page, `Preview: ${titleOf(example, SCALAR_VAR)}`)
  ).toBeVisible()
  await expect(page.getByText('Unable to display the plot')).toBeVisible()
  await expect(page.getByText(/scalar/)).toContainText(String(scalarValue))
})

test('right-clicking an image cell renders the picture instead of a figure', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openPreviewPlot(page, {
    example,
    col: columnOf(example, IMAGE_VAR),
    row: 0,
  })

  await expect(
    plotTab(page, `Preview: ${titleOf(example, IMAGE_VAR)}`)
  ).toBeVisible()
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  await expect(plotFigure(page)).toHaveCount(0)
})
