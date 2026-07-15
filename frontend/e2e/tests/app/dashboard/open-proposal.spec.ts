import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import { waitForTableData } from '#support/table'

test('opening a proposal loads the dashboard header', async ({ page }) => {
  const tableData = waitForTableData(page)

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
