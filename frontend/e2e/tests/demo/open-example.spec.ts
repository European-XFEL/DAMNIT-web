import { test, expect } from '#fixtures/production'
import { XPCS } from '#examples/xpcs'
import { breadcrumb } from '#support/dashboard'
import { GALLERY, openExample } from '#support/demo'
import { expectRunRows } from '#support/table'

test('an example opens on its instrument and name and a table of all its runs', async ({
  page,
}) => {
  await openExample(page, 'xpcs')

  const { label, instrument } = GALLERY.xpcs
  const identity = breadcrumb(page).getByRole('link', { name: label })
  await expect(identity).toContainText(instrument)
  await expect(identity).toContainText(label)

  await expectRunRows(page, XPCS.meta.runs.length)
})
