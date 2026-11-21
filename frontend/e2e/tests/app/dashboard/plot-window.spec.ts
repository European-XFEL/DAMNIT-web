import type { BrowserContext, Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { numberVars, type Example } from '#examples/xpcs'
import { dashboardHeader, dashboardNav, statusBar } from '#support/dashboard'
import { openSummaryPlot, plotFigure } from '#support/plots'
import {
  columnOf,
  contextMenu,
  openProposal,
  rightClickHeader,
  titleOf,
} from '#support/table'

const y = numberVars[0]
const windowUrl = new RegExp(`/plots/summary\\?x=run&y=${y}&window$`)
const dashboardUrl = new RegExp(`/plots/summary\\?x=run&y=${y}$`)

async function openPlotPopup(
  page: Page,
  { context, example }: { context: BrowserContext; example: Example }
) {
  await openProposal(page, example)
  await rightClickHeader(page, { example, col: columnOf(example, y) })
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    contextMenu(page).getByRole('link', { name: 'Open in new window' }).click(),
  ])
  await expect(plotFigure(popup)).toBeVisible()

  return popup
}

test('the table menu opens a plot alone in a popup, which takes the next click on the same plot and leads back to the dashboard', async ({
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
  await openSummaryPlot(page, { example, col: columnOf(example, y) })
  await expect(plotFigure(page)).toBeVisible()
  await dashboardHeader(page)
    .getByRole('link', { name: 'Open in new window' })
    .click()
  await expect(popup).toHaveURL(windowUrl)
  await expect(popup.locator('body')).toHaveAttribute('data-kept', 'yes')
  expect(context.pages()).toHaveLength(2)

  // Open in dashboard
  await popup.getByRole('link', { name: 'Open in dashboard' }).click()
  await expect(popup).toHaveURL(dashboardUrl)
  await expect(dashboardNav(popup)).toBeVisible()
  await expect(plotFigure(popup)).toBeVisible()
})
