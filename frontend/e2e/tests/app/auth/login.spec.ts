import { test, expect } from '#fixtures'

test.use({ authenticated: false })

test('a signed-out visit hands its path to the SSO login', async ({
  page,
  baseURL,
}) => {
  const path = 'proposal/1234/plots/summary?x=run&y=pulses'

  // Arm the wait before navigating, and let goto settle at commit (not load): the
  // SSO redirect PrivateRoute -> LoginRoute fires window.location.replace after mount,
  // which would abort a load-waiting goto. Asserting the request, not the SPA URL,
  // avoids racing that full-page redirect.
  const login = page.waitForRequest('**/oauth/login**')
  await page.goto(path, { waitUntil: 'commit' })

  const url = new URL((await login).url())
  const visited = new URL(path, baseURL)
  expect(url.searchParams.get('redirect_uri')).toBe(
    visited.pathname + visited.search
  )
})

test('the login page opened directly hands off home', async ({
  page,
  baseURL,
}) => {
  const login = page.waitForRequest('**/oauth/login**')
  await page.goto('login', { waitUntil: 'commit' })

  const url = new URL((await login).url())
  expect(url.searchParams.get('redirect_uri')).toBe(
    new URL('home', baseURL).pathname
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
