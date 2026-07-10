import { test, expect } from '#fixtures'

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
