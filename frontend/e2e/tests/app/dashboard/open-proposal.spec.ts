import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import { breadcrumb } from '#support/dashboard'
import { openProposal, waitForTableData } from '#support/table'

const PROPOSAL = XPCS.proposalMetadata[0]

test('opening a proposal names its instrument, number and PI above the table, and its title on hover', async ({
  page,
}) => {
  const tableData = waitForTableData(page)

  await page.goto('proposal/6996')

  await expect(page).toHaveURL(/\/app\/proposal\/6996$/)

  // The crumb row names the proposal, then the table as the view
  const identity = breadcrumb(page).getByRole('button', { name: /p6996/ })
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
