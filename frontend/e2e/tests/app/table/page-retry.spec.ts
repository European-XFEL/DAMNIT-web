import { test, expect } from '#fixtures'
import { gridCanvas } from '#support/grid'
import { cell, columnOf } from '#support/table'

test('rows that failed to load fill in once the server answers, with no scroll', async ({
  page,
  example,
}) => {
  // Registered after the fixture's routes, so Playwright's last-wins order
  // sees the page fetches first.
  let serverDown = true
  const askedPages = new Set<number>()
  await page.route('**/graphql', (route) => {
    const { operationName, variables } = (route.request().postDataJSON() ??
      {}) as { operationName?: string; variables?: { page?: number } }
    if (operationName !== 'LightweightTableDataQuery' || !serverDown) {
      return route.fallback()
    }

    askedPages.add(variables?.page ?? 1)
    return route.abort('failed')
  })

  // The hook reports each page it gives up on, once RetryLink has spent its
  // tries.
  const failedPages = new Set<number>()
  page.on('console', (message) => {
    const failed = /^Page (\d+) failed to load/.exec(message.text())
    if (failed) {
      failedPages.add(Number(failed[1]))
    }
  })

  await page.goto(`proposal/${example.proposalMetadata[0].number}`)
  await expect(gridCanvas(page)).toBeVisible()

  // The mock answers every page with every run, so wait until the hook has
  // given up on every page in view. The grid's first window brings page 2.
  const everyPageFailed = () =>
    askedPages.has(2) &&
    [...askedPages].every((pageNumber) => failedPages.has(pageNumber))
  await expect.poll(everyPageFailed, { timeout: 10_000 }).toBe(true)
  const trains = cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
  await expect(trains).toBeEmpty()

  // The server comes back, and the user sits still.
  serverDown = false

  await expect(trains).not.toBeEmpty({ timeout: 10_000 })
})
