import { expect, type Locator, type Page } from '@playwright/test'

// The header user menu is an UnstyledButton with no aria-label, showing the
// signed-in name and a chevron. Open it by clicking the name in the banner, then
// return the dropdown. Mantine portals the dropdown outside the banner, so
// callers scope its items to the returned menu, not the header.
export async function openUserMenu(page: Page, name: string): Promise<Locator> {
  await page.getByRole('banner').getByText(name, { exact: true }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  return menu
}
