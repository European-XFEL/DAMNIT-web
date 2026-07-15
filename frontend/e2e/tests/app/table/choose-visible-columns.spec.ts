import { test, expect } from '#fixtures'
import {
  columnHeader,
  expectVisibleColumns,
  openPopover,
  openProposal,
  rowCheckbox,
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

  await expect(variables).toContainText('-1')
  await expectVisibleColumns(page, 12)
  await expect(columnHeader(page, 'Trains')).toHaveCount(0)
})

test('searching filters the variable list', async ({ page, example }) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Filter the list
  await page.getByPlaceholder('Search variables').fill('sample')

  await expect(page.getByRole('row', { name: 'Sample type' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Sample X [mm]' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Sample Y [mm]' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Trains' })).toHaveCount(0)

  // Clear the search
  await page.getByPlaceholder('Search variables').clear()
  await expect(page.getByRole('row', { name: 'Trains' })).toBeVisible()
})

test('a hidden column stays hidden after the popover closes', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Hide the column
  const variables = await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Trains').uncheck()
  await expect(variables).toContainText('-1')
  await expectVisibleColumns(page, 12)

  // Close the popover
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Search variables')).toHaveCount(0)
  await expect(variables).toContainText('-1')
  await expectVisibleColumns(page, 12)

  // Reopen the popover
  await variables.click()
  await expect(rowCheckbox(page, 'Trains')).not.toBeChecked()
})
