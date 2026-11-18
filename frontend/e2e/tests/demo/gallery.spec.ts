import { test, expect } from '#fixtures/production'
import { GALLERY } from '#support/demo'

test('the gallery links to every example the demo ships', async ({ page }) => {
  const examples = Object.entries(GALLERY)
  expect(examples.length).toBeGreaterThan(0)

  await page.goto('')

  for (const [id, { title }] of examples) {
    await expect(page.getByRole('link', { name: title })).toHaveAttribute(
      'href',
      `#/example/${id}/table`
    )
  }
})
