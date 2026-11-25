import { test, expect } from '@damnit-frontend/testing/playwright/production'
import { breadcrumb } from '@damnit-frontend/testing/playwright/dashboard'
import { GALLERY, openExample } from '#tests/e2e/support/demo'
import { RUN_COUNT } from '#tests/e2e/support/example'
import { expectRunRows } from '@damnit-frontend/testing/playwright/table'

test('an example opens on its instrument and name and a table of all its runs', async ({
  page,
}) => {
  await openExample(page, 'xpcs')

  const { label, instrument } = GALLERY.xpcs
  const identity = breadcrumb(page).getByRole('link', { name: label })
  await expect(identity).toContainText(instrument)
  await expect(identity).toContainText(label)

  await expectRunRows(page, RUN_COUNT)
})
