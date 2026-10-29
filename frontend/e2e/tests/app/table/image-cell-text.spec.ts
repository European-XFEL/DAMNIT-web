import { test, expect } from '#fixtures'
import { IMAGE_CELL } from '#examples/xpcs'
import { WIDE_VIEWPORT } from '#support/grid'
import { cell, openProposal } from '#support/table'

test.use({ viewport: WIDE_VIEWPORT })

test('a screen reader hears a loaded image cell as "image", not its data', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await expect(cell(page, IMAGE_CELL)).toHaveText('image')
})
