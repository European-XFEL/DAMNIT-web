import { test, expect } from '#fixtures'
import {
  columnHeader,
  expectVisibleColumns,
  openPopover,
  openProposal,
  popoverAction,
  rowCheckbox,
  searchMarks,
} from '#support/table'

test('hiding a variable removes its column from the table', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  // Baseline: every column is visible
  await expectVisibleColumns(page, 13)
  await expect(columnHeader(page, 'Trains')).toHaveCount(1)

  // Hide the Trains column
  const variables = await openPopover(page, 'Variables')

  const trains = rowCheckbox(page, 'Trains')
  await expect(trains).toBeChecked()
  await trains.uncheck()

  await expect(variables.getByText('1 hidden', { exact: true })).toBeVisible()
  await expectVisibleColumns(page, 12)
  await expect(columnHeader(page, 'Trains')).toHaveCount(0)
})

test('searching marks the variables it finds and keeps the rest', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Find the three Sample columns
  await page.getByPlaceholder('Search variables').fill('sample')

  await expect(searchMarks(page)).toHaveText(['Sample', 'Sample', 'Sample'])
  await expect(rowCheckbox(page, 'Trains')).toBeVisible()

  // Clear the search
  await page.getByPlaceholder('Search variables').clear()
  await expect(searchMarks(page)).toHaveCount(0)
})

test('a hidden column stays hidden after the popover closes', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Hide the column
  const variables = await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Trains').uncheck()
  await expect(variables.getByText('1 hidden', { exact: true })).toBeVisible()
  await expectVisibleColumns(page, 12)

  // Close the popover
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Search variables')).toHaveCount(0)
  await expect(variables.getByText('1 hidden', { exact: true })).toBeVisible()
  await expectVisibleColumns(page, 12)

  // Reopen the popover
  await variables.click()
  await expect(rowCheckbox(page, 'Trains')).not.toBeChecked()
})

test('the popover link hides every variable, then shows them again', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Hide everything the popover configures, leaving the pinned Run column
  await popoverAction(page).click()
  await expectVisibleColumns(page, 1)

  // Show it all again
  await popoverAction(page).click()
  await expectVisibleColumns(page, 13)
})

test('under a search the popover link hides only the matches', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Find the three Sample columns
  await page.getByPlaceholder('Search variables').fill('sample')
  await expect(popoverAction(page)).toHaveText('Hide 3 matches')

  await popoverAction(page).click()

  // The three Sample columns go; the ones the search did not find stay
  await expectVisibleColumns(page, 10)
})
