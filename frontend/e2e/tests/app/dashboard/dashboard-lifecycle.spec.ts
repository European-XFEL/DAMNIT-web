import { test, expect } from '#fixtures'

import { XPCS, numberVars, xpcsWithProposals } from '#examples/xpcs'
import {
  columnHeader,
  columnOf,
  expectVisibleColumns,
  openDashboard,
  openPopover,
  openProposal,
  rowCheckbox,
  selectRun,
  selectedRunTab,
} from '#support/table'
import {
  openSummaryPlot,
  PLOT_VIEWPORT,
  plotTab,
  showTable,
} from '#support/plots'
import { proposalLink } from '#support/proposals'

// Both tests build dashboard state through the grid toolbar and the plot tabs,
// which the narrow layout hides; the wide viewport also keeps every column in
// the horizontal fold so the coordinate-driven plot clicks land.
//
// The multi-semester example makes the home page issue one proposal query per
// semester. A single-proposal user only issues one, which is enough to hide a
// teardown that wipes the shared Apollo cache out from under it.
test.use({ viewport: PLOT_VIEWPORT, example: xpcsWithProposals })

const PROPOSAL = XPCS.proposalMetadata[0].number

test('clicking the logo tears down the dashboard state', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Open a summary plot while the grid is still pristine: the plot clicks are
  // coordinate-driven and assume uniform columns, so this must precede the hide.
  // Trains (numberVars[0]) is hidden below, so plot the next column instead.
  await openSummaryPlot(page, columnOf(numberVars[1]))
  await expect(plotTab(page, 'Plots')).toBeVisible()
  await showTable(page)

  // Select a run.
  await selectRun(page, { row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  // Hide the Trains column.
  await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Trains').uncheck()
  await expect(columnHeader(page, 'Trains')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Click the DAMNIT! logo to leave the dashboard.
  await page.getByRole('banner').getByRole('link', { name: 'DAMNIT!' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)

  // Reopen the same proposal through the home list.
  await openDashboard(page, () => proposalLink(page, PROPOSAL).click())

  // Every piece of state is gone: the hidden column is back, no run is selected,
  // and the plots have been discarded.
  await expectVisibleColumns(page, 13)
  await expect(columnHeader(page, 'Trains')).toHaveCount(1)
  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(plotTab(page, 'Plots')).toHaveCount(0)
})

test('switching dashboard tabs keeps the run selection and sidebar', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Select a run and confirm the sidebar shows its values.
  await selectRun(page, { row: 0 })
  const panel = page.getByRole('complementary')
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(panel.getByText('silica')).toBeVisible()

  // Open a plot (which switches to the Plots tab), then switch back to Table.
  await openSummaryPlot(page, columnOf(numberVars[0]))
  await expect(plotTab(page, 'Plots')).toBeVisible()
  await showTable(page)

  // The selection and its sidebar values survived the tab round trip.
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(panel.getByText('silica')).toBeVisible()
})
