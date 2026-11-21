import { test, expect } from '#fixtures'
import { HZDR_CAMPAIGN, mockHZDR } from '#support/hzdr'

test.beforeEach(async ({ page }) => {
  await mockHZDR(page)
})

test('Home lists campaigns from the summary route, newest first', async ({
  page,
}) => {
  const summaries = page.waitForRequest(
    /\/metadata\/hzdr\/source-summaries\?since=/
  )
  await page.goto('home')
  await summaries

  const rows = page.getByTestId('home-campaign-row')
  await expect(rows).toHaveCount(2)
  await expect(
    rows.first().getByRole('link', { name: HZDR_CAMPAIGN })
  ).toHaveAttribute('href', new RegExp(`/source/${HZDR_CAMPAIGN}$`))
  await expect(rows.first().getByText('+3 today')).toBeVisible()
  await expect(
    rows.first().getByRole('link', { name: '2 waiting in Review matches' })
  ).toBeVisible()

  await page.getByLabel('Filter campaigns').fill('pilot')
  await expect(rows).toHaveCount(1)
})

test('Home never asks for every shot of every campaign', async ({ page }) => {
  const full: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/metadata/hzdr/sources') {
      full.push(request.url())
    }
  })
  await page.goto('home')
  await expect(page.getByTestId('home-campaign-row')).toHaveCount(2)
  expect(full).toEqual([])
})
