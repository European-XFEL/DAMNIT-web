import type { Page, Request } from '@playwright/test'

import { test, expect } from '#fixtures'
import { XPCS, type Example } from '#examples/xpcs'
import { fullMetadata, type MockApi } from '#mocks'
import { WIDE_VIEWPORT } from '#support/grid'
import { columnOf, openProposal, titleOf } from '#support/table'
import { statusBar } from '#support/dashboard'
import {
  openPreviewPlot,
  plotFigure,
  plotEntry,
  selectCells,
} from '#support/plots'

// The mock computed run 1 at 22:13:20 UTC on 14 November 2023, more than a
// week ago, so the bar shows its date.
test.use({ viewport: WIDE_VIEWPORT, timezoneId: 'UTC' })

// Variables chosen for the dtype of their *preview* data, which differs from
// the scalar shown in the table cell. One per render branch:
const SCATTER_VAR = 'xgm_intensity' // 1-D array -> Plotly scatter
const SCALAR_VAR = 'n_trains' // scalar number -> "unable to display" notice
const IMAGE_VAR = 'xpcs_g2_plot' // image -> plain <img>

// Run 1 is computed again to the same preview data, and a push says so.
function recomputeRun1(api: MockApi, example: Example) {
  const run1 = example.data.find((run) => run.variables.run.value === 1)!
  const change = {
    1: {
      [SCATTER_VAR]: {
        ...run1.variables[SCATTER_VAR],
        computed_at: Date.UTC(2023, 11, 1, 9, 30),
      },
    },
  }
  api.editRuns(change)
  api.pushLatestData({
    metadata: fullMetadata(example.meta, example.meta.runs),
    runs: change,
  })
}

const isPreviewQuery = (request: Request) =>
  (request.postDataJSON() as { operationName?: string } | null)
    ?.operationName === 'PreviewDataQuery'

// Opens run 1's preview, computed again once its data is drawn.
async function openOutdatedPreview(
  page: Page,
  { api, example }: { api: MockApi; example: Example }
) {
  await openProposal(page, example)
  await openPreviewPlot(page, {
    example,
    col: columnOf(example, SCATTER_VAR),
    row: 0,
  })
  await expect(
    statusBar(page).getByText('Computed: 14 November 2023')
  ).toBeVisible()

  recomputeRun1(api, example)

  const item = statusBar(page).getByRole('button', {
    name: 'Computed: 14 November 2023. Reload',
  })
  await expect(item).toBeVisible()

  return item
}

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

  await expect(plotEntry(page, titleOf(example, SCATTER_VAR))).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('a preview plot says when the data it draws was computed', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openPreviewPlot(page, {
    example,
    col: columnOf(example, SCATTER_VAR),
    row: 0,
  })

  // The status bar shows the date.
  const computed = statusBar(page).getByText('Computed: 14 November 2023')
  await expect(computed).toBeVisible()

  // Its tooltip shows the time too.
  await computed.hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    'Computed 14 November 2023 at 22:13:20'
  )
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

  const entry = plotEntry(page, titleOf(example, SCATTER_VAR))
  await expect(entry).toBeVisible()
  await expect(entry).toContainText('Runs 1-2')
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

  await expect(plotEntry(page, titleOf(example, SCALAR_VAR))).toBeVisible()
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

  await expect(plotEntry(page, titleOf(example, IMAGE_VAR))).toBeVisible()
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  await expect(plotFigure(page)).toHaveCount(0)
})

test('a preview plot names a run it draws that was computed again', async ({
  page,
  api,
  example,
}) => {
  const item = await openOutdatedPreview(page, { api, example })

  await item.hover()

  await expect(page.getByRole('dialog')).toContainText(
    'Computed 14 November 2023 at 22:13:20Run 1 has newer data.'
  )
})

test('a click on an outdated preview plot item reloads its data', async ({
  page,
  api,
  example,
}) => {
  const item = await openOutdatedPreview(page, { api, example })
  const reloaded = page.waitForRequest(isPreviewQuery)

  await item.click()

  await reloaded
  await expect(
    statusBar(page).getByText('Computed: 1 December 2023')
  ).toBeVisible()
  await expect(
    statusBar(page).getByRole('button', { name: /^Computed/ })
  ).toHaveCount(0)
})

test('Reload in an outdated preview plot bubble reloads its data', async ({
  page,
  api,
  example,
}) => {
  const item = await openOutdatedPreview(page, { api, example })
  await item.hover()
  const reloaded = page.waitForRequest(isPreviewQuery)

  await page.getByRole('button', { name: 'Reload', exact: true }).click()

  await reloaded
  await expect(
    statusBar(page).getByText('Computed: 1 December 2023')
  ).toBeVisible()
  await expect(
    statusBar(page).getByRole('button', { name: /^Computed/ })
  ).toHaveCount(0)
})
