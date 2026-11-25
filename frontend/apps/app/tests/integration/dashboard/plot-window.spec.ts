import type { BrowserContext, Page } from '@playwright/test'

import { test, expect } from '#tests/integration/fixtures'
import { numberVars, type Example } from '#tests/integration/examples/xpcs'
import {
  dashboardHeader,
  dashboardNav,
  showTable,
  statusBar,
} from '@damnit-frontend/testing/playwright/dashboard'
import {
  openSummaryPlot,
  plotFigure,
} from '@damnit-frontend/testing/playwright/plots'
import {
  contextMenu,
  rightClickHeader,
} from '@damnit-frontend/testing/playwright/table'
import {
  columnOf,
  openProposal,
  titleOf,
} from '#tests/integration/support/example'

const y = numberVars[0]
const windowUrl = new RegExp(`/plots/summary\\?x=run&y=${y}&window$`)
const dashboardUrl = new RegExp(`/plots/summary\\?x=run&y=${y}$`)

async function openPlotPopup(
  page: Page,
  { context, example }: { context: BrowserContext; example: Example }
) {
  await openProposal(page, example)
  await rightClickHeader(page, { col: columnOf(example, y) })
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    contextMenu(page).getByRole('link', { name: 'Open in new window' }).click(),
  ])
  await expect(plotFigure(popup)).toBeVisible()

  return popup
}

test('the table menu opens a plot alone in a popup, which takes the next click on the same plot and hands the plot back to the dashboard', async ({
  page,
  context,
  example,
}) => {
  const name = `${titleOf(example, y)} vs. Run`

  // Open the popup
  const popup = await openPlotPopup(page, { context, example })
  await expect(popup).toHaveURL(windowUrl)
  await expect(popup).toHaveTitle(`p6996: ${name} (All runs)`)
  await expect(statusBar(popup)).toBeVisible()
  await expect(dashboardNav(popup)).toHaveCount(0)
  await expect(contextMenu(page)).toHaveCount(0)

  // The same plot from the dashboard's header, which keeps the popup unreloaded
  await popup.evaluate(() => (document.body.dataset.kept = 'yes'))
  await openSummaryPlot(page, { col: columnOf(example, y) })
  await expect(plotFigure(page)).toBeVisible()
  await dashboardHeader(page)
    .getByRole('link', { name: 'Open in new window' })
    .click()
  await expect(popup).toHaveURL(windowUrl)
  await expect(popup.locator('body')).toHaveAttribute('data-kept', 'yes')
  expect(context.pages()).toHaveLength(2)

  // Open in dashboard, with the dashboard back on the table
  await showTable(page)
  await Promise.all([
    popup.waitForEvent('close'),
    popup.getByRole('link', { name: 'Open in dashboard' }).click(),
  ])
  await expect(page).toHaveURL(dashboardUrl)
  await expect(plotFigure(page)).toBeVisible()
  expect(context.pages()).toEqual([page])
})

test('with the dashboard closed, the popup opens the plot in a new dashboard tab and closes', async ({
  page,
  context,
  example,
}) => {
  const popup = await openPlotPopup(page, { context, example })
  await page.close()

  const [dashboard] = await Promise.all([
    context.waitForEvent('page'),
    popup.waitForEvent('close'),
    popup.getByRole('link', { name: 'Open in dashboard' }).click(),
  ])
  await expect(dashboard).toHaveURL(dashboardUrl)
  await expect(dashboardNav(dashboard)).toBeVisible()
  await expect(plotFigure(dashboard)).toBeVisible()
  expect(context.pages()).toEqual([dashboard])
})

// The wait for an answer still counts as the click, so the tab is not blocked.
test('with the opener on the proposals list, the popup waits for an answer, then opens the plot in a new dashboard tab and closes', async ({
  page,
  context,
  example,
}) => {
  const popup = await openPlotPopup(page, { context, example })
  await page.goto('home')

  const [dashboard] = await Promise.all([
    context.waitForEvent('page'),
    popup.waitForEvent('close'),
    popup.getByRole('link', { name: 'Open in dashboard' }).click(),
  ])
  await expect(dashboard).toHaveURL(dashboardUrl)
  await expect(plotFigure(dashboard)).toBeVisible()
  await expect(page).toHaveURL(/\/home$/)
})
