import { test, expect } from '#fixtures'
import { UNTAGGED_VARIABLE, xpcsWithUntagged } from '#examples/xpcs'
import {
  columnDisclosure,
  openPopover,
  openProposal,
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

  // A tagged variable opens its tags
  await columnDisclosure(page, 'Trains').click()
  await expect(await rowDetails(page, 'Trains')).toContainText('Run details')

  // An untagged one has nothing to open, so it offers no way in at all
  await expect(
    columnDisclosure(page, titleOf(example, UNTAGGED_VARIABLE))
  ).toHaveCount(0)
})
