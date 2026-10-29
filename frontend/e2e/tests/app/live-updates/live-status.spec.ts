import type { Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { XPCS, xpcsWithProposals } from '#examples/xpcs'
import { fullMetadata } from '#mocks'
import { homeLink, statusBar } from '#support/dashboard'
import { proposalLink } from '#support/proposals'
import { openDashboard, openProposal } from '#support/table'

// graphql-ws waits about 1, 2 and 4 s before the first three reconnects, so
// once the mock has refused three the next wait runs 8 to 9 s.
const REFUSALS = 3

function liveItem(page: Page) {
  return statusBar(page).getByRole('img', { name: 'Live updates.' })
}

function lostItem(page: Page) {
  return statusBar(page).getByRole('button', { name: /^Lost live updates/ })
}

function tryNowButton(page: Page) {
  return statusBar(page).getByRole('button', { name: 'Try now', exact: true })
}

function stoppedItem(page: Page) {
  return statusBar(page).getByRole('button', { name: /^Live updates stopped/ })
}

function reloadButton(page: Page) {
  return statusBar(page).getByRole('button', { name: 'Reload', exact: true })
}

test('Try now on lost live updates reconnects without sitting out the wait', async ({
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
  // starts: a press then ends nothing, so press again.
  await expect(async () => {
    await lostItem(page).hover({ timeout: 500 })
    await tryNowButton(page).click({ timeout: 500 })
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

test('Reload on stopped live updates reloads the page', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await expect(liveItem(page)).toBeVisible()
  api.refuseLiveUpdates()
  await stoppedItem(page).hover()

  const load = page.waitForEvent('load')
  await reloadButton(page).click()

  await load
})

test('a click on stopped live updates opens their bubble and keeps the page', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await expect(liveItem(page)).toBeVisible()
  api.refuseLiveUpdates()
  await expect(stoppedItem(page)).toBeVisible({ timeout: 1000 })
  // A reload would take the mark away
  await page.evaluate(() => (document.body.dataset.kept = 'yes'))

  await stoppedItem(page).click()

  await expect(reloadButton(page)).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-kept', 'yes')
})

test('an ended login shows on stopped live updates', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await expect(liveItem(page)).toBeVisible()

  // graphql-ws waits about 1 s before it tries again
  await api.endLogin()
  await stoppedItem(page).hover()

  await expect(statusBar(page).getByRole('dialog')).toContainText(
    'Your login has ended.'
  )
})

test.describe('a user with several proposals', () => {
  test.use({ example: xpcsWithProposals })

  test('opening another proposal shows no changes since it opened', async ({
    page,
    api,
    example,
  }) => {
    await openProposal(page, example)
    const tooltip = page.getByRole('tooltip')

    // A run changes on the first proposal
    api.pushLatestData({
      metadata: fullMetadata(example.meta, XPCS.meta.runs),
      runs: {
        [XPCS.meta.runs[0]]: { n_trains: { dtype: 'number', value: 4242 } },
      },
    })
    await liveItem(page).hover()
    await expect(tooltip).toHaveText(/^Live updates\. Last update /)

    // Open another through the home list
    await homeLink(page).click()
    const other = example.proposalMetadata[1].number
    await openDashboard(page, () => proposalLink(page, other).click())
    // Hovered: after a click, a focus from a script is not focus-visible, and
    // the tooltip opens on focus only when it is.
    await liveItem(page).hover()

    await expect(tooltip).toHaveText(/^Live updates\. No changes since/)
  })
})
