import type { Page } from '@playwright/test'

import { test, expect } from '#tests/integration/fixtures'
import { statusBar } from '@damnit-frontend/testing/playwright/dashboard'
import { gridCanvas } from '@damnit-frontend/testing/playwright/grid'
import {
  cell,
  operationNameOf,
} from '@damnit-frontend/testing/playwright/table'
import { columnOf } from '#tests/integration/support/example'

// Registered after the fixture's routes, so Playwright's last-wins order sees
// the page fetches first.
async function refuseWhileDown(
  page: Page,
  { operation, failureReport }: { operation: string; failureReport: RegExp }
) {
  const server = {
    down: true,
    askedPages: new Set<number>(),
    failedPages: new Set<number>(),
    tryingPages: new Set<number>(),
  }
  await page.route('**/graphql', (route) => {
    const request = route.request()
    if (operationNameOf(request) !== operation || !server.down) {
      return route.fallback()
    }

    const { variables } = request.postDataJSON() as {
      variables?: { page?: number }
    }
    const pageNumber = variables?.page ?? 1
    server.askedPages.add(pageNumber)
    server.tryingPages.add(pageNumber)
    return route.abort('failed')
  })

  page.on('console', (message) => {
    const failed = failureReport.exec(message.text())
    if (failed) {
      const pageNumber = Number(failed[1])
      server.failedPages.add(pageNumber)
      server.tryingPages.delete(pageNumber)
    }
  })

  return server
}

// Page 1 holds runs 1 to 10 and page 2 the rest, so a spec waits until the hook
// has given up on every page in view. The grid's first window brings page 2.
async function waitForEveryPageToFail(server: {
  askedPages: Set<number>
  failedPages: Set<number>
}) {
  const everyPageFailed = () =>
    server.askedPages.has(2) &&
    [...server.askedPages].every((pageNumber) =>
      server.failedPages.has(pageNumber)
    )
  await expect
    .poll(everyPageFailed, { timeout: 15_000, intervals: [50] })
    .toBe(true)
}

function runCount(page: Page, name: RegExp) {
  return statusBar(page).getByRole('button', { name })
}

test('rows that failed to load fill in once the server answers, with no scroll', async ({
  page,
  example,
}) => {
  const server = await refuseWhileDown(page, {
    operation: 'LightweightTableDataQuery',
    failureReport: /^Page (\d+) failed to load/,
  })

  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await expect(gridCanvas(page)).toBeVisible()
  await waitForEveryPageToFail(server)
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
  await page.clock.install()
  const server = await refuseWhileDown(page, {
    operation: 'LightweightTableDataQuery',
    failureReport: /^Page (\d+) failed to load/,
  })

  // Every page in view fails, and the run count says so once.
  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await waitForEveryPageToFail(server)
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

  // A press during a try does nothing. The jump fires the clock's due try, and
  // the loop steps every try to failure, so only the press reaches the server.
  const now = await page.evaluate(() => Date.now())
  // The page's time moves on while this call travels, so pause a second ahead.
  await page.clock.pauseAt(now + 1000)
  await expect
    .poll(
      async () => {
        if (server.tryingPages.size > 0) {
          // RetryLink's wait between attempts, so each step fires one.
          await page.clock.runFor(1000)
        }
        return server.tryingPages.size
      },
      { timeout: 15_000, intervals: [50] }
    )
    .toBe(0)
  server.down = false
  const answered = page.waitForRequest(
    (request) => operationNameOf(request) === 'LightweightTableDataQuery'
  )
  await statusBar(page)
    .getByRole('button', { name: 'Try again', exact: true })
    .click()
  await answered

  await page.clock.resume()
  const trains = cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
  await expect(trains).not.toBeEmpty()

  // The tint goes with the failure.
  await expect(runCount(page, /^13 runs/)).toHaveCount(0)
  await expect(statusBar(page).getByText('13 runs')).toBeVisible()
})

test('the run count says which values failed when only the heavy values did', async ({
  page,
  example,
}) => {
  const server = await refuseWhileDown(page, {
    operation: 'DeferredTableDataQuery',
    failureReport: /^Heavy values for page (\d+) failed to load/,
  })

  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await waitForEveryPageToFail(server)

  await expect(
    runCount(page, /^13 runs\. Some values didn't load\. Try again$/)
  ).toBeVisible()
})
