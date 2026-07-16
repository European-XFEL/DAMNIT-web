import { test, expect } from '#fixtures'

import { EMPTY } from '#examples/xpcs'
import { dataCells, expectVisibleColumns, openProposal } from '#support/table'

test.use({ example: EMPTY })

test('a proposal with no runs shows column headers over an empty table', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Every variable still contributes a column header...
  await expectVisibleColumns(page, 13)
  // ...but with zero runs, the grid draws no data cells and shows no empty
  // message: just the headers over a blank area.
  await expect(dataCells(page)).toHaveCount(0)
})
