import { test, expect } from '#fixtures/production'

test('the home page names DAMNIT and links "View proposals" to the app', async ({
  page,
  baseURL,
}) => {
  await page.goto('')

  await expect(
    page.getByRole('heading', { level: 1, name: 'DAMNIT!' })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'View proposals' })
  ).toHaveAttribute('href', `${baseURL}app/`)
})

// The demo runs in its own suite, so this checks where the link points
// rather than following it.
test('"Browse examples" links to the demo', async ({ page, baseURL }) => {
  await page.goto('')

  await expect(
    page.getByRole('link', { name: 'Browse examples' })
  ).toHaveAttribute('href', `${baseURL}demo/`)
})
