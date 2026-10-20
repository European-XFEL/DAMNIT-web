import type { Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import { fullMetadata } from '#mocks'
import { statusBar } from '#support/dashboard'
import { openProposal } from '#support/table'

// graphql-ws waits about 1, 2 and 4 s before the first three reconnects, so
// once the mock has refused three the next wait runs 8 to 9 s.
const REFUSALS = 3

function liveItem(page: Page) {
  return statusBar(page).getByRole('img', { name: 'Live updates.' })
}

function lostItem(page: Page) {
  return statusBar(page).getByRole('button', { name: /^Lost live updates/ })
}

function stoppedItem(page: Page) {
  return statusBar(page).getByRole('img', { name: /^Live updates stopped/ })
}

test('clicking the lost live updates reconnects without sitting out the wait', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await expect(liveItem(page)).toBeVisible()

  // Drop live updates and refuse the next reconnects, so the waits grow
  await api.dropLiveUpdates({ refuse: REFUSALS })
  await expect
    .poll(() => api.connections(), { timeout: 15_000 })
    .toBe(1 + REFUSALS)

  // The last refusal can still be on its way to the page, before its wait
  // starts: a click then ends nothing, so click again.
  await expect(async () => {
    await lostItem(page).click({ timeout: 500 })
    await expect(liveItem(page)).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 3000 })
})

test('a push of metadata alone does not count as an update', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  const grid = page.locator('[role="grid"]')
  const seedRuns = XPCS.meta.runs.length
  await expect(grid).toHaveAttribute('aria-rowcount', String(seedRuns + 1))
  const tooltip = page.getByRole('tooltip')

  // A run is registered before it has values
  const newRun = XPCS.meta.runs[seedRuns - 1] + 1
  const metadata = fullMetadata(example.meta, [...XPCS.meta.runs, newRun])
  api.pushLatestData({ metadata, runs: {} })
  await expect(grid).toHaveAttribute('aria-rowcount', String(seedRuns + 2))
  await liveItem(page).focus()
  await expect(tooltip).toHaveText(/^Live updates\. No changes since/)

  // Its first value arrives
  api.pushLatestData({
    metadata,
    runs: { [newRun]: { n_trains: { dtype: 'number', value: 4242 } } },
  })
  await expect(tooltip).toHaveText(/^Live updates\. Last update /)
})

test('live updates the server refuses are asked for once and show stopped', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await expect(liveItem(page)).toBeVisible()

  api.refuseLiveUpdates()

  await expect(stoppedItem(page)).toBeVisible({ timeout: 1000 })
  expect(api.subscriptions()).toBe(1)
})

test('a subscription the server ends shows live updates stopped', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await expect(liveItem(page)).toBeVisible()

  api.endLiveUpdates()

  await expect(stoppedItem(page)).toBeVisible()
})
