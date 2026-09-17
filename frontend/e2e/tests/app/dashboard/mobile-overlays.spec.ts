import { test, expect } from '#fixtures'
import { openContextFile } from '#support/context-file'
import {
  allRunsNavItem,
  breadcrumb,
  dashboardNav,
  navBurger,
} from '#support/dashboard'
import { gridCanvas } from '#support/grid'
import { plotVariable } from '#support/plots'
import { closeAside, openProposal, selectRun, titleOf } from '#support/table'

// Below `sm` the nav and the run aside cover the view instead of sitting beside
// it. Playwright counts an element slid off screen as visible, so these catch it.
test.use({ viewport: { width: 414, height: 896 } })

test('the mobile nav is hidden until the burger opens it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await expect(dashboardNav(page)).toBeHidden()

  await navBurger(page).click()

  await expect(dashboardNav(page)).toBeVisible()
})

test('the proposal in the crumb row closes the open mobile nav', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await navBurger(page).click()
  await expect(dashboardNav(page)).toBeVisible()

  await breadcrumb(page).getByRole('button').click()

  await expect(dashboardNav(page)).toBeHidden()
  await expect(gridCanvas(page)).toBeVisible()
})

test('the open mobile nav hides the table behind it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const burger = navBurger(page)
  const grid = gridCanvas(page)

  // Open the nav
  await burger.click()
  await expect(grid).toBeHidden()

  // Close the nav
  await burger.click()
  await expect(grid).toBeVisible()
})

test('a run open at phone size hides the table behind it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const grid = gridCanvas(page)

  // Open the run
  await selectRun(page, { example, row: 0 })
  await expect(page.getByRole('complementary')).toBeVisible()
  await expect(grid).toBeHidden()

  // Close the run
  await closeAside(page)
  await expect(grid).toBeVisible()
})

test('a run open at phone size covers the table only', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const burger = navBurger(page)
  const run = page.getByRole('complementary')
  await selectRun(page, { example, row: 0 })

  // Another view comes out from under the run
  await burger.click()
  await openContextFile(page)
  await expect(run).toBeHidden()

  // Back on the table the run still covers it
  await burger.click()
  await allRunsNavItem(page).click()
  await expect(run).toBeVisible()
  await expect(gridCanvas(page)).toBeHidden()
})

test.describe('a touch screen', () => {
  // Touch has no hover, so a plot's close mark shows without one.
  test.use({ hasTouch: true })

  test('a plot close mark shows in the open mobile nav and hides with it', async ({
    page,
    example,
  }) => {
    await openProposal(page, example)
    const burger = navBurger(page)
    // Found from the page, since a lookup through the hidden nav finds nothing
    // and would pass as hidden whatever the mark does.
    const closeMark = page.getByRole('button', {
      name: `Close ${titleOf(example, 'n_trains')} vs. Run,`,
    })

    // Make a plot from the nav, which closes it
    await burger.click()
    await plotVariable(page, { example, variable: 'n_trains' })
    await expect(dashboardNav(page)).toBeHidden()

    // Open the nav
    await burger.click()
    await expect(closeMark).toBeVisible()

    // Close the nav
    await burger.click()
    await expect(closeMark).toBeHidden()
  })
})
