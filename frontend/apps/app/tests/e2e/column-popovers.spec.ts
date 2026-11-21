import { test, expect } from '#fixtures/production'
import {
  columnHeader,
  columnTitles,
  openPopover,
  rowCheckbox,
} from '#support/table'
import { openMockProposal } from '#support/real-api'

test("selecting a tag shows only that tag's columns", async ({ page }) => {
  await openMockProposal(page)

  await openPopover(page, 'Tags')
  await rowCheckbox(page, 'Beam').check()

  await expect
    .poll(() => columnTitles(page))
    .toEqual(['Run', 'Beam on', 'Attenuator', 'Transmission'])
})

test('unchecking a variable hides its column', async ({ page }) => {
  await openMockProposal(page)
  await expect(columnHeader(page, 'Trains')).toHaveCount(1)

  await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Trains').uncheck()

  await expect(columnHeader(page, 'Trains')).toHaveCount(0)
})
