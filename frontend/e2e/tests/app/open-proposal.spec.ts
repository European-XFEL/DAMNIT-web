import { test, expect } from '#fixtures'

import { XPCS } from '#examples/xpcs'

test('opening a proposal loads the dashboard header', async ({ page }) => {
  // Set up before navigating so the table-data response can't be missed. It
  // must arrive before teardown for the api fixture's drift guard to see it,
  // and waiting on the real request keeps this off the mock's internals.
  const tableData = page.waitForResponse((response) => {
    if (!response.url().includes('/graphql')) {
      return false
    }
    const { operationName } = (response.request().postDataJSON() ?? {}) as {
      operationName?: string
    }
    return (operationName ?? '').endsWith('TableDataQuery')
  })

  await page.goto('proposal/6996')

  await expect(page).toHaveURL(/\/app\/proposal\/6996$/)

  const header = page.getByRole('banner')
  await expect(
    header.getByRole('heading', { name: 'p6996 - Christian Gutt' })
  ).toBeVisible()
  await expect(header.getByText('MID', { exact: true })).toBeVisible()
  await expect(header.getByText(XPCS.proposalMetadata[0].title)).toBeVisible()

  await tableData
})
