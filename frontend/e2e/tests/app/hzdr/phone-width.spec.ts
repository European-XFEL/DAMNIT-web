import { test, expect } from '#fixtures'
import { HZDR_CAMPAIGN, horizontalOverflow, mockHZDR } from '#support/hzdr'

// The HZDR pages at phone width (390 px, an iPhone 12-15): no page may scroll
// sideways. The shot table scrolls inside its own box; the page around it
// must still fit.
test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await mockHZDR(page)
})

// Each page with a heading that shows it has rendered its own content.
const PAGES: [name: string, path: string, heading: string][] = [
  ['Home', 'home', 'Campaigns'],
  ['Flow monitor', 'flow-monitor', 'HZDR flow monitor'],
  ['Review matches', 'review-matches', 'Review matches'],
  ['Docs', 'docs', 'Using DAMNIT-web at HZDR'],
  ['Shot table', `source/${HZDR_CAMPAIGN}`, HZDR_CAMPAIGN],
]

for (const [name, path, heading] of PAGES) {
  test(`${name} fits a phone screen`, async ({ page }) => {
    await page.goto(path)
    await expect(
      page.getByRole('heading', { name: heading, exact: true }).first()
    ).toBeVisible()
    // Let late layout (fonts, plots) settle before measuring.
    await page.waitForLoadState('networkidle')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
}

test('the check notices a page that scrolls sideways', async ({ page }) => {
  await page.goto('home')
  await expect(
    page.getByRole('heading', { name: 'Campaigns', exact: true })
  ).toBeVisible()
  await page.evaluate(() => {
    const wide = document.createElement('div')
    wide.style.width = '600px'
    wide.style.height = '1px'
    document.body.append(wide)
  })
  expect(await horizontalOverflow(page)).toBeGreaterThan(0)
})
