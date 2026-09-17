import { test, expect } from '#fixtures'
import { dashboardHeader, dashboardNav } from '#support/dashboard'
import { openProposal } from '#support/table'

test('the user avatar keeps its place when the nav collapses', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  // The avatar is hidden from the a11y tree, so no role finds it.
  const avatar = dashboardNav(page).locator('.mantine-Avatar-root')
  const expanded = await avatar.boundingBox()

  const header = dashboardHeader(page)
  await header.getByRole('button', { name: 'Collapse navigation' }).click()
  await expect(
    header.getByRole('button', { name: 'Expand navigation' })
  ).toBeVisible()

  expect(await avatar.boundingBox()).toEqual(expanded)
})
