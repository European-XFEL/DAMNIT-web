import { test, expect } from '#fixtures'
import { openHome } from '#support/proposals'

test('an unknown URL shows the not-found page and returns home', async ({
  page,
}) => {
  // Land on the not-found page
  await page.goto('definitely-not-a-route')
  await expect(
    page.getByRole('heading', { name: 'DAMNIT! Page not found.' })
  ).toBeVisible()

  // Return home
  await page.getByRole('button', { name: 'Return home' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
})

test('an unknown URL keeps its URL on the not-found page, so Back leaves it', async ({
  page,
}) => {
  // Open home, then the unknown URL, so Back has home to return to
  await openHome(page)
  await page.goto('definitely-not-a-route')
  await expect(
    page.getByRole('heading', { name: 'DAMNIT! Page not found.' })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/app\/definitely-not-a-route$/)

  // Go back home
  await page.goBack()
  await expect(page).toHaveURL(/\/app\/home$/)
})

// The frontend has no per-proposal guard: a proposal the user cannot access is
// not blocked client-side. ProposalWrapper fires its metadata query, the backend
// (here the router) errors, and it shows the not-found page. The default
// XPCS user can access only 6996, so 9999 models "no access".
test('opening a proposal you cannot access lands on not-found, and Back leaves it', async ({
  page,
}) => {
  // Open home, then the proposal, so Back has home to return to
  await openHome(page)
  await page.goto('proposal/9999')
  await expect(
    page.getByRole('heading', { name: 'DAMNIT! Page not found.' })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/app\/proposal\/9999$/)

  // Go back home
  await page.goBack()
  await expect(page).toHaveURL(/\/app\/home$/)
})
