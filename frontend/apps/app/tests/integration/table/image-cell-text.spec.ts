import { test, expect } from '#tests/integration/fixtures'
import { IMAGE_CELL } from '#tests/integration/examples/xpcs'
import { WIDE_VIEWPORT } from '@damnit-frontend/testing/playwright/grid'
import { cell } from '@damnit-frontend/testing/playwright/table'
import { openProposal } from '#tests/integration/support/example'

test.use({ viewport: WIDE_VIEWPORT })

test('a screen reader hears a loaded image cell as "image", not its data', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await expect(cell(page, IMAGE_CELL)).toHaveText('image')
})
