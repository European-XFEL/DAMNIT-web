import { test, expect } from '#fixtures'
import { XPCS, xpcsWithProposals } from '#examples/xpcs'
import {
  semesterLabels,
  expandMark,
  expandProposal,
  expectNotTruncated,
  openHome,
  proposalLink,
  proposalNumbers,
  proposalRow,
} from '#support/proposals'
import { breadcrumb } from '#support/dashboard'
import { waitForTableData } from '#support/table'

test.use({ example: xpcsWithProposals })

// Proposal 6996, the one that leads to the fully working XPCS dashboard.
const PROPOSAL = XPCS.proposalMetadata[0]

test("the home page groups the user's proposals by semester, newest first", async ({
  page,
}) => {
  await openHome(page)

  // Semesters are listed newest first, one row per semester.
  await expect(semesterLabels(page)).toHaveText([
    '2024 - I',
    '2023 - II',
    '2021 - II',
  ])

  // Within the 2024 - I semester the later proposal (700004, May 31) sorts ahead
  // of the earlier one (6996, May 30), each tagged with its instrument. These two
  // auto-waiting assertions also gate the snapshot read below, so it can't run
  // while the semester's query is still loading.
  await expect(proposalRow(page, 700004).getByText('SQS')).toBeVisible()
  await expect(proposalRow(page, 6996).getByText('MID')).toBeVisible()
  const numbers = await proposalNumbers(page).allTextContents()
  expect(numbers.indexOf('700004')).toBeLessThan(numbers.indexOf('6996'))
})

test('the instrument pill shows the whole tag', async ({ page }) => {
  await openHome(page)

  // SQS is the widest tag in this fixture, so the column would clip it first.
  await expectNotTruncated(proposalRow(page, 700004).getByText('SQS'))
})

test('clicking a proposal opens its dashboard', async ({ page }) => {
  await openHome(page)

  const tableData = waitForTableData(page)
  await proposalLink(page, PROPOSAL.number).click()

  await expect(page).toHaveURL(/\/app\/proposal\/6996$/)
  await expect(
    breadcrumb(page).getByRole('button', { name: /p6996/ })
  ).toContainText(PROPOSAL.principal_investigator)

  await tableData
})

test('expanding a proposal reveals its title and path', async ({ page }) => {
  await openHome(page)

  await expandProposal(page, PROPOSAL.number)

  await expect(page.getByText('Title:')).toBeVisible()
  await expect(page.getByText(PROPOSAL.title)).toBeVisible()
  await expect(page.getByText('Path:')).toBeVisible()
  await expect(page.getByText(PROPOSAL.damnit_path)).toBeVisible()
})

test("a proposal's mark turns when its row is expanded", async ({ page }) => {
  await openHome(page)

  const mark = expandMark(page, PROPOSAL.number)
  await expect(mark).toHaveCSS('transform', 'none')

  await expandProposal(page, PROPOSAL.number)

  await expect(mark).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
})
