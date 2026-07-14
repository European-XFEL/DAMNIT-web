import { test, expect } from '#fixtures'

import { XPCS } from '#examples/xpcs'
import { openUserMenu } from '#support/auth'

const USER_NAME = XPCS.userInfo.name

test('the header user menu logs the user out', async ({ page }) => {
  await page.goto('home')

  // The header greets the signed-in user.
  await expect(page.getByRole('banner').getByText(USER_NAME)).toBeVisible()

  const menu = await openUserMenu(page, USER_NAME)
  await expect(
    menu.getByRole('menuitem', { name: 'Send feedback' })
  ).toBeVisible()

  // Arm the logout POST before clicking, then confirm the session ends on the
  // logged-out landing. The heading assertion rides out the userinfo re-fetch
  // that logout's cache reset triggers.
  const logout = page.waitForRequest('**/oauth/logout**')
  await menu.getByRole('menuitem', { name: 'Logout' }).click()
  await logout

  await expect(page).toHaveURL(/\/app\/logged-out$/)
  await expect(
    page.getByRole('heading', { name: 'You have been logged out.' })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log back in' })).toBeVisible()
})

test('the logged-out page recognises a live session', async ({ page }) => {
  await page.goto('logged-out')

  const heading = page.getByRole('heading', { level: 2 })
  await expect(heading).toContainText("Nope, you're still logged in,")
  await expect(heading).toContainText(USER_NAME)
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible()
})
