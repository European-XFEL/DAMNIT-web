import { test, expect } from '#fixtures'

import { ERROR_CELLS, ERROR_ROW, xpcsWithErrors } from '#examples/xpcs'
import {
  activateCell,
  columnOf,
  openProposal,
  selectedRunTab,
  titleOf,
} from '#support/table'

test('activating a single cell shows only that variable', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The first row is run 1 in the XPCS example.
  await activateCell(page, { col: columnOf('sample_type'), row: 0 })

  const panel = page.getByRole('complementary')
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(panel.getByText(titleOf('sample_type'))).toBeVisible()
  await expect(panel.getByText('silica')).toBeVisible()
  // Only the activated cell: the run's other variables and images are gone.
  await expect(panel.getByText(titleOf('xgm_intensity'))).toHaveCount(0)
  await expect(panel.locator('img')).toHaveCount(0)
})

test.describe('errored cell', () => {
  test.use({ example: xpcsWithErrors })

  test('activating an errored cell opens the sidebar but shows no value', async ({
    page,
    example,
  }) => {
    await openProposal(page, example)

    // xgm_intensity failed for run 1, so its cell carries value null.
    const errored = ERROR_CELLS[0]
    await activateCell(page, { col: errored.col, row: ERROR_ROW })

    const panel = page.getByRole('complementary')
    // The aside still opens for the run.
    await expect(selectedRunTab(page)).toBeVisible()
    // The null value is filtered out, so nothing renders for the cell.
    await expect(panel.getByText(titleOf(errored.variable))).toHaveCount(0)
    await expect(panel.locator('img')).toHaveCount(0)
  })
})
