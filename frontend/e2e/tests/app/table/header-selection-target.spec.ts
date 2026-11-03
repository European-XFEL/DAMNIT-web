import { test, expect } from '#fixtures'
import { WIDE_VIEWPORT } from '#support/grid'
import {
  columnOf,
  expectVisibleColumns,
  openPopover,
  openProposal,
  rowCheckbox,
  selectedColumnHeaders,
} from '#support/table'
import { selectColumns } from '#support/plots'

test.use({ viewport: WIDE_VIEWPORT })

// Glide selects columns by index into the visible list, so hiding one ahead of
// the selection used to slide it onto the next column along, taking the summary
// plot's axes with it.
test('the column selection stays on its column when one to its left is hidden', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await selectColumns(page, { example, cols: [columnOf(example, 'n_pulses')] })
  await expect(selectedColumnHeaders(page)).toHaveText(['Pulses'])

  // Hide Trains, which sits between Run and the selected Pulses.
  await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Trains').uncheck()
  await expectVisibleColumns(page, 12)

  await expect(selectedColumnHeaders(page)).toHaveText(['Pulses'])
})
