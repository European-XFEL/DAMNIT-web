import { expect, type Locator, type Page } from '@playwright/test'

// The home page renders a Mantine DataTable per semester plus the outer
// semester table, so several <table> elements coexist and getByRole('table') is
// ambiguous. These helpers target the pieces by text and by the proposal-number
// links, the only stable, human-meaningful anchors on the page. Each proposal
// row carries two links: the number, whose accessible name is the digits, and
// the principal investigator, named after the person. So a digit-only name
// matches exactly one link per proposal.

// The semester rows, top to bottom: one label per semester, like "2024 - I".
// The regex matches only those labels, so toHaveText asserts the semester order.
export function semesterLabels(page: Page): Locator {
  return page.getByText(/^\d{4} - I{1,2}$/)
}

// The proposal-number cells, in table order.
export function proposalNumbers(page: Page): Locator {
  return page.getByRole('link', { name: /^\d+$/ })
}

// A single proposal's number link, matched by its exact digit name.
export function proposalLink(page: Page, proposal: number): Locator {
  return page.getByRole('link', { name: String(proposal), exact: true })
}

// A single proposal's row. Filtering rows by the number link also catches the
// outer semester row that nests the whole sub-table, so anchor on the link and walk
// up to its own row instead.
export function proposalRow(page: Page, proposal: number): Locator {
  return proposalLink(page, proposal).locator('xpath=ancestor::tr[1]')
}

export async function openHome(page: Page) {
  await page.goto('home')
  // The semester table renders straight from the auth slice, but each semester's
  // proposals arrive from a per-semester query; wait for the first row to land.
  await expect(proposalNumbers(page).first()).toBeVisible()
}

// Expand a proposal to its title/path panel by clicking the leading plus-icon
// cell. That cell is not a link, so the row expands instead of navigating to the
// dashboard the way the number and PI cells would.
export async function expandProposal(page: Page, proposal: number) {
  await proposalRow(page, proposal).getByRole('cell').first().click()
}
