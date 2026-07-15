import { test, expect } from '#fixtures'

test.use({ authenticated: false })

// LoginRoute always sends the user back to /home after SSO, ignoring the
// state.from that PrivateRoute records, so a deep link does not survive the
// login round-trip. We assert the hand-off itself, not a preserved destination.
test('an unauthenticated visit hands off to SSO login', async ({
  page,
  baseURL,
}) => {
  // Arm the wait before navigating, and let goto settle at commit (not load): the
  // SSO redirect PrivateRoute -> LoginRoute fires window.location.href after mount,
  // which would abort a load-waiting goto. Asserting the request, not the SPA URL,
  // avoids racing that full-page redirect.
  const login = page.waitForRequest('**/oauth/login**')
  await page.goto('home', { waitUntil: 'commit' })

  const url = new URL((await login).url())
  expect(url.searchParams.get('redirect_uri')).toBe(
    new URL('home', baseURL).href
  )
})
