import { expect, type Locator, type Page } from '@playwright/test'

import { gridCanvas } from '#support/grid'

// The band across the top: the logo home, the nav toggle, the crumb row.
export function dashboardHeader(page: Page): Locator {
  return page.getByRole('banner')
}

// The dashboard's left nav: one item per view under its header, the user menu.
export function dashboardNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Dashboard' })
}

// The crumbs in the band naming the proposal and the view on show.
export function breadcrumb(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Breadcrumb' })
}

// Below `sm` the Burger in the band shows and hides the nav.
export function navBurger(page: Page): Locator {
  return page.getByRole('button', { name: 'Toggle navigation' })
}

// Exact, since a plot entry that follows every run also reads "All runs".
export function allRunsNavItem(page: Page): Locator {
  return dashboardNav(page).getByRole('button', {
    name: 'All runs',
    exact: true,
  })
}

// Opening a plot switches to its view, which unmounts the table. Switch back
// and wait for the grid before the next canvas action.
export async function showTable(page: Page) {
  await allRunsNavItem(page).click()
  await expect(gridCanvas(page)).toBeVisible()
}
