import { test, expect } from '#fixtures'
import { ERROR_CELLS, ERROR_ROW, xpcsWithErrors } from '#examples/xpcs'
import {
  activateCell,
  columnOf,
  expectVisibleColumns,
  openPopover,
  openProposal,
  rowCheckbox,
  highlightedRow,
  selectRun,
  selectedRunTab,
  titleOf,
} from '#support/table'

test('activating a single cell shows only that variable', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The first row is run 1 in the XPCS example.
  await activateCell(page, {
    example,
    col: columnOf(example, 'sample_type'),
    row: 0,
  })

  const panel = page.getByRole('complementary')
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(panel.getByText(titleOf(example, 'sample_type'))).toBeVisible()
  await expect(panel.getByText('silica')).toBeVisible()
  // Only the activated cell: the run's other variables and images are gone.
  await expect(panel.getByText(titleOf(example, 'xgm_intensity'))).toHaveCount(
    0
  )
  await expect(panel.locator('img')).toHaveCount(0)
})

test('activating the run number opens the whole run', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await activateCell(page, { example, col: columnOf(example, 'run'), row: 0 })

  const panel = page.getByRole('complementary')
  await expect(panel.getByText(titleOf(example, 'sample_type'))).toBeVisible()
  await expect(panel.getByText(titleOf(example, 'xgm_intensity'))).toBeVisible()
})

test.describe('errored cell', () => {
  test.use({ example: xpcsWithErrors })

  test('activating an errored cell shows the failure instead of a value', async ({
    page,
    example,
  }) => {
    await openProposal(page, example)

    // xgm_intensity failed for run 1, so its cell carries an error and no value.
    const errored = ERROR_CELLS[0]
    await activateCell(page, { example, col: errored.col, row: ERROR_ROW })

    const panel = page.getByRole('complementary')
    await expect(selectedRunTab(page)).toBeVisible()
    // The cell renders under its own title, with the failure in place of the
    // value it never got.
    await expect(
      panel.getByText(titleOf(example, errored.variable))
    ).toBeVisible()
    await expect(panel.getByText(errored.error.message)).toBeVisible()
    await expect(panel.locator('img')).toHaveCount(0)
  })
})

// The run and the variable are one selection, so activating a cell selects its
// run as well. Before that they were separate and only the aside moved.
test('activating a cell highlights the row of the run it belongs to', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The second row is run 2 in the XPCS example.
  await activateCell(page, {
    example,
    col: columnOf(example, 'sample_type'),
    row: 1,
  })

  await expect(selectedRunTab(page)).toContainText('Run: 2')
  await expect(highlightedRow(page, { row: 1 })).toBeAttached()
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})

// Hiding a column is about the grid. The aside shows the variable the user asked
// for by name, so it keeps showing it; it used to go blank instead.
test('the drilled-into variable stays in the aside when its column is hidden', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const sampleType = titleOf(example, 'sample_type')

  await activateCell(page, {
    example,
    col: columnOf(example, 'sample_type'),
    row: 0,
  })
  const panel = page.getByRole('complementary')
  await expect(panel.getByText(sampleType)).toBeVisible()

  // Hide the very column that was drilled into.
  await openPopover(page, 'Variables')
  await rowCheckbox(page, sampleType).uncheck()
  await expectVisibleColumns(page, 12)

  await expect(panel.getByText(sampleType)).toBeVisible()
  await expect(panel.getByText('silica')).toBeVisible()
})

// Selecting a row is a whole-run gesture, so it widens the aside back out. The
// clear used to fall out of an absent payload key rather than being asked for.
test('selecting a run after drilling in shows its variables again', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Drill into one cell of the first run.
  await activateCell(page, {
    example,
    col: columnOf(example, 'sample_type'),
    row: 0,
  })
  const panel = page.getByRole('complementary')
  await expect(panel.getByText(titleOf(example, 'xgm_intensity'))).toHaveCount(
    0
  )

  // Select another run outright.
  await selectRun(page, { example, row: 1 })

  await expect(selectedRunTab(page)).toContainText('Run: 2')
  await expect(panel.getByText(titleOf(example, 'sample_type'))).toBeVisible()
  await expect(panel.getByText(titleOf(example, 'xgm_intensity'))).toBeVisible()
})
