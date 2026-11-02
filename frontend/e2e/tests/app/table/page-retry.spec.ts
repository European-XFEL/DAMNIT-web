import type { Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { statusBar } from '#support/dashboard'
import { gridCanvas } from '#support/grid'
import { cell, columnOf } from '#support/table'

// Registered after the fixture's routes, so Playwright's last-wins order sees
// the page fetches first.
async function refuseWhileDown(page: Page, operation: string) {
  const server = { down: true, askedPages: new Set<number>() }
  await page.route('**/graphql', (route) => {
    const { operationName, variables } = (route.request().postDataJSON() ??
      {}) as { operationName?: string; variables?: { page?: number } }
    if (operationName !== operation || !server.down) {
      return route.fallback()
    }

    server.askedPages.add(variables?.page ?? 1)
    return route.abort('failed')
  })

  return server
}

// The pages the hook has given up on, once RetryLink has spent its tries.
function watchFailedPages(page: Page, report: RegExp) {
  const failedPages = new Set<number>()
  page.on('console', (message) => {
    const failed = report.exec(message.text())
    if (failed) {
      failedPages.add(Number(failed[1]))
    }
  })

  return failedPages
}

// The mock answers every page with every run, so a spec waits until the hook
// has given up on every page in view. The grid's first window brings page 2.
async function waitForEveryPageToFail(
  server: { askedPages: Set<number> },
  failedPages: Set<number>
) {
  const everyPageFailed = () =>
    server.askedPages.has(2) &&
    [...server.askedPages].every((pageNumber) => failedPages.has(pageNumber))
  await expect.poll(everyPageFailed, { timeout: 15_000 }).toBe(true)
}

function runCount(page: Page, name: RegExp) {
  return statusBar(page).getByRole('button', { name })
}

test('rows that failed to load fill in once the server answers, with no scroll', async ({
  page,
  example,
}) => {
  const server = await refuseWhileDown(page, 'LightweightTableDataQuery')
  const failedPages = watchFailedPages(page, /^Page (\d+) failed to load/)

  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await expect(gridCanvas(page)).toBeVisible()
  await waitForEveryPageToFail(server, failedPages)
  const trains = cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
  await expect(trains).toBeEmpty()

  // The server comes back, and the user sits still.
  server.down = false

  await expect(trains).not.toBeEmpty({ timeout: 10_000 })
})

test('the run count names the runs that failed to load, and Try again fills them', async ({
  page,
  example,
}) => {
  const server = await refuseWhileDown(page, 'LightweightTableDataQuery')
  const failedPages = watchFailedPages(page, /^Page (\d+) failed to load/)

  // Every page in view fails, and the run count says so once.
  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await waitForEveryPageToFail(server, failedPages)
  const tinted = runCount(page, /^13 runs\. Some runs didn't load\. Try again$/)
  await expect(tinted).toBeVisible()
  await expect(
    statusBar(page).getByRole('status').filter({
      hasText: "Some runs didn't load.",
    })
  ).toHaveCount(1)

  // The bubble names the runs: pages 1 and 2 hold all 13.
  await tinted.hover()
  await expect(statusBar(page).getByRole('dialog')).toContainText(
    "Some runs didn't load Runs 1 to 13. Trying again"
  )

  // The server comes back, and the user presses Try again, which ignores a
  // press while a try is out.
  server.down = false
  const tryAgain = statusBar(page).getByRole('button', {
    name: 'Try again',
    exact: true,
  })
  const trains = cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
  await expect(async () => {
    await tinted.hover({ timeout: 500 })
    await tryAgain.click({ timeout: 500 })
    await expect(trains).not.toBeEmpty({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  // The tint goes with the failure.
  await expect(runCount(page, /^13 runs/)).toHaveCount(0)
  await expect(statusBar(page).getByText('13 runs')).toBeVisible()
})

test('the run count says which values failed when only the heavy values did', async ({
  page,
  example,
}) => {
  const server = await refuseWhileDown(page, 'DeferredTableDataQuery')
  const failedPages = watchFailedPages(
    page,
    /^Heavy values for page (\d+) failed to load/
  )

  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await waitForEveryPageToFail(server, failedPages)

  await expect(
    runCount(page, /^13 runs\. Some values didn't load\. Try again$/)
  ).toBeVisible()
})
