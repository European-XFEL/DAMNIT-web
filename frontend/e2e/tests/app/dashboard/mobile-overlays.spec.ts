import { test, expect } from '#fixtures'
import { contextFileNavItem, openContextFile } from '#support/context-file'
import {
  allRunsNavItem,
  breadcrumb,
  dashboardNav,
  navBurger,
} from '#support/dashboard'
import { gridCanvas } from '#support/grid'
import { plotVariable, selectCells } from '#support/plots'
import {
  asideCloseButton,
  closeAside,
  openProposal,
  selectRun,
  titleOf,
} from '#support/table'

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

test('the burger opens the nav onto the view on show and takes focus back after a pick', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const burger = navBurger(page)
  await expect(burger).toHaveAttribute('aria-expanded', 'false')

  // Open with the keyboard
  await burger.focus()
  await page.keyboard.press('Enter')
  await expect(burger).toHaveAttribute('aria-expanded', 'true')
  await expect(allRunsNavItem(page)).toBeFocused()

  // Pick the context file and let its editor mount
  await contextFileNavItem(page).focus()
  await page.keyboard.press('Enter')
  await expect(burger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.view-line').first()).toBeVisible()
  await expect(burger).toBeFocused()
})

test('making a plot from the mobile nav hands focus back to the burger', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const burger = navBurger(page)
  await burger.click()

  await plotVariable(page, { example, variable: 'n_trains' })

  await expect(dashboardNav(page)).toBeHidden()
  await expect(burger).toBeFocused()
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

test('the open mobile nav hides an open run behind it too', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await expect(asideCloseButton(page)).toBeVisible()

  await navBurger(page).click()

  await expect(asideCloseButton(page)).toBeHidden()
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

test('a run closed at phone size leaves nothing to scroll to sideways', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const pageWidth = () =>
    page.evaluate(() => document.scrollingElement!.scrollWidth)

  // Before any run
  expect(await pageWidth()).toBe(414)

  // After a run opened and closed
  await selectRun(page, { example, row: 0 })
  await closeAside(page)
  await expect(page.getByRole('complementary')).toBeHidden()
  expect(await pageWidth()).toBe(414)
})

test('a run opened from the keyboard at phone size takes focus and hands it back to the grid', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const grid = gridCanvas(page)

  // Open the run from the keyboard
  await selectCells(page, { example, cells: [{ col: 1, row: 0 }] })
  await expect(grid).toBeFocused()
  await page.keyboard.press('Shift+Space')
  await expect(asideCloseButton(page)).toBeFocused()

  // Close it from the keyboard
  await page.keyboard.press('Enter')
  await expect(grid).toBeFocused()
})

test('a run opened by a click at phone size takes focus and hands it back to the grid', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const grid = gridCanvas(page)

  // Open the run with a click, after which Glide focuses its canvas
  await selectRun(page, { example, row: 0 })
  await expect(grid).toBeHidden()
  await expect(asideCloseButton(page)).toBeFocused()

  // Close it from the keyboard
  await page.keyboard.press('Enter')
  await expect(grid).toBeFocused()
})

test('escape closes a run opened by a click at phone size and focuses the grid', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const grid = gridCanvas(page)
  await selectRun(page, { example, row: 0 })
  await expect(grid).toBeHidden()

  await page.keyboard.press('Escape')

  await expect(grid).toBeFocused()
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

test('a run the nav brings back at phone size leaves focus on the burger and closes onto the grid', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const burger = navBurger(page)
  await selectRun(page, { example, row: 0 })
  await burger.click()
  await openContextFile(page)

  // Back to the table from the keyboard
  await burger.focus()
  await page.keyboard.press('Enter')
  await allRunsNavItem(page).focus()
  await page.keyboard.press('Enter')
  await expect(asideCloseButton(page)).toBeVisible()
  await expect(burger).toBeFocused()

  // Close the run from the keyboard
  await asideCloseButton(page).focus()
  await page.keyboard.press('Enter')
  await expect(gridCanvas(page)).toBeFocused()
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
