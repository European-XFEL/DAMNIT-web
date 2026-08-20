import { test, expect } from '#fixtures'
import { UNTAGGED_VARIABLE, xpcsWithUntagged } from '#examples/xpcs'
import {
  openPopover,
  openProposal,
  popoverRow,
  rowDetails,
  titleOf,
} from '#support/table'

// The details a row opens are its tags and nothing else, so this example gives
// the popover one variable with none.
test.use({ example: xpcsWithUntagged })

test('only a variable with tags has details to open', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  const details = rowDetails(page)

  // A tagged variable opens its tags
  await popoverRow(page, 'Trains', { exact: true }).click()
  await expect(details).toContainText('Run details')

  // An untagged one opens nothing, so the panel above is left as it was
  await popoverRow(page, titleOf(example, UNTAGGED_VARIABLE), {
    exact: true,
  }).click()
  await expect(details).toHaveCount(1)
  await expect(details).toContainText('Run details')
})
