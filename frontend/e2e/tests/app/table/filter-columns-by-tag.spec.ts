import { test, expect } from '#fixtures'
import {
  columnHeader,
  expectVisibleColumns,
  openPopover,
  openProposal,
  rowCheckbox,
} from '#support/table'

test("selecting a tag shows only that tag's columns", async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await expectVisibleColumns(page, 13)

  const tags = await openPopover(page, 'Tags')
  await rowCheckbox(page, 'Beam properties').check()

  await expect(tags).toContainText('1')
  await expectVisibleColumns(page, 3)
  await expect(columnHeader(page, 'XGM intensity [uJ]')).toHaveCount(1)
  await expect(columnHeader(page, 'Trains')).toHaveCount(0)
})

test('selecting more tags widens the visible columns', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const tags = await openPopover(page, 'Tags')
  await rowCheckbox(page, 'Beam properties').check()
  await rowCheckbox(page, 'Run details').check()

  await expect(tags).toContainText('2')
  await expectVisibleColumns(page, 9)
  await expect(columnHeader(page, 'Trains')).toHaveCount(1)
})

test('clearing all tags restores every column', async ({ page, example }) => {
  await openProposal(page, example)

  // Select a tag
  const tags = await openPopover(page, 'Tags')
  await rowCheckbox(page, 'Beam properties').check()
  await expectVisibleColumns(page, 3)

  // Clear all tags
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(tags).toHaveText('Tags')
  await expectVisibleColumns(page, 13)
})
