import { test, expect } from '#tests/integration/fixtures'
import { WIDE_VIEWPORT } from '@damnit-frontend/testing/playwright/grid'
import {
  expectVisibleColumns,
  openPopover,
  rowCheckbox,
  selectedColumnHeaders,
} from '@damnit-frontend/testing/playwright/table'
import { columnOf, openProposal } from '#tests/integration/support/example'
import { selectColumns } from '@damnit-frontend/testing/playwright/plots'

test.use({ viewport: WIDE_VIEWPORT })

// Glide selects columns by index into the visible list, so hiding one ahead of
// the selection used to slide it onto the next column along, taking the summary
// plot's axes with it.
test('the column selection stays on its column when one to its left is hidden', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await selectColumns(page, { cols: [columnOf(example, 'n_pulses')] })
  await expect(selectedColumnHeaders(page)).toHaveText(['Pulses'])

  // Hide Trains, which sits between Run and the selected Pulses.
  await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Trains').uncheck()
  await expectVisibleColumns(page, 12)

  await expect(selectedColumnHeaders(page)).toHaveText(['Pulses'])
})
