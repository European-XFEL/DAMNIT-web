import { test, expect } from '#tests/integration/fixtures'
import { XPCS } from '#tests/integration/examples/xpcs'
import { breadcrumb } from '@damnit-frontend/testing/playwright/dashboard'
import { waitForTableData } from '@damnit-frontend/testing/playwright/table'
import { openProposal } from '#tests/integration/support/example'

const PROPOSAL = XPCS.proposalMetadata[0]

test('opening a proposal names its instrument, number and PI above the table, and its title on hover', async ({
  page,
}) => {
  const tableData = waitForTableData(page)

  await page.goto('proposal/6996')

  await expect(page).toHaveURL(/\/app\/proposal\/6996\/table$/)

  // The crumb row names the proposal, then the table as the view
  const identity = breadcrumb(page).getByRole('link', { name: /p6996/ })
  await expect(identity).toContainText('MID')
  await expect(identity).toContainText('p6996')
  await expect(identity).toContainText(PROPOSAL.principal_investigator)
  await expect(breadcrumb(page).getByText('All runs')).toHaveAttribute(
    'aria-current',
    'page'
  )

  // The proposal title shows on hover
  await identity.hover()
  await expect(page.getByRole('tooltip')).toHaveText(PROPOSAL.title)

  await tableData
})

test('the dashboard names the proposal as its main heading', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `p${PROPOSAL.number}`
  )
})
