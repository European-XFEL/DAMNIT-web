import { test, expect } from '#fixtures'

test.use({ authenticated: false })

// LoginRoute always sends the user back to /home after SSO, so a deep link does
// not survive the login round-trip. We assert the hand-off itself.
test('an unauthenticated visit hands off to SSO login', async ({
  page,
  baseURL,
}) => {
  // Arm the wait before navigating, and let goto settle at commit (not load): the
  // SSO redirect PrivateRoute -> LoginRoute fires window.location.replace after mount,
  // which would abort a load-waiting goto. Asserting the request, not the SPA URL,
  // avoids racing that full-page redirect.
  const login = page.waitForRequest('**/oauth/login**')
  await page.goto('home', { waitUntil: 'commit' })

  const url = new URL((await login).url())
  expect(url.searchParams.get('redirect_uri')).toBe(
    new URL('home', baseURL).href
  )
})

test('Back from the SSO login returns to the page before it', async ({
  page,
}) => {
  await page.goto('logged-out')
  await expect(
    page.getByRole('heading', { name: 'You have been logged out.' })
  ).toBeVisible()

  // Open a private page, which hands off to SSO
  const login = page.waitForRequest('**/oauth/login**')
  await page.goto('home', { waitUntil: 'commit' })
  await login
  await expect(page).toHaveURL(/\/oauth\/login/)

  // Go back
  await page.goBack()
  await expect(page).toHaveURL(/\/app\/logged-out$/)
})
