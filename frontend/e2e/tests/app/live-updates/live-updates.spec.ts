import { test, expect } from '#fixtures'
import {
  XPCS,
  IMAGE_CELL,
  IMAGE_VARIABLE,
  IMAGE_VALUE,
  numberVars,
  xpcsWithPendingImage,
} from '#examples/xpcs'
import { fullMetadata } from '#mocks'
import { dashboardHeader } from '#support/dashboard'
import { WIDE_VIEWPORT } from '#support/grid'
import { openSummaryPlot, plotEntries } from '#support/plots'
import { proposalLink } from '#support/proposals'
import {
  cell,
  columnOf,
  hoverCell,
  moveAway,
  openProposal,
  selectRun,
  selectedRunTab,
  titleOf,
  tooltipCard,
  waitForCellLoaded,
} from '#support/table'

// Every updated run sits in the initial vertical fold.
test.use({ viewport: WIDE_VIEWPORT })

// graphql-ws waits about 1, 2 and 4 s before the first three reconnects, so
// once the mock has refused three the next wait runs 8 to 9 s.
const REFUSALS = 3
// That wait, its 1 s of spread, and 1 s to spare.
const WAIT_RUNS_OUT = (2 ** REFUSALS + 2) * 1000

test('a finished run appears as a new row', async ({ page, api, example }) => {
  await openProposal(page, example)
  const grid = page.locator('[role="grid"]')
  const seedRuns = XPCS.meta.runs.length

  // Wait for the seed's data to land before pushing, so the page's own rows
  // cannot revert the new run afterwards. Gate on a populated cell, not
  // aria-rowcount: the metadata query fills runs (and the row count) with no
  // cell data, so the row count can reach seedRuns + 1 before the rows land.
  await expect(
    cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
  ).not.toBeEmpty()

  // aria-rowcount counts the header row too, so the seed shows seedRuns + 1.
  await expect(grid).toHaveAttribute('aria-rowcount', String(seedRuns + 1))

  const newRun = XPCS.meta.runs[seedRuns - 1] + 1
  api.pushLatestData({
    metadata: fullMetadata(example.meta, [...XPCS.meta.runs, newRun]),
    runs: {
      [newRun]: {
        run: { dtype: 'number', value: newRun },
        n_trains: { dtype: 'number', value: 4242 },
      },
    },
  })

  // The push grows the grid's row model by one. Glide fixes the canvas height at
  // mount and does not paint the appended bottom row in this harness, so this
  // asserts the accessibility row count (what a screen reader hears), not the new
  // run's cells; test 2 covers a pushed value rendering into a cell.
  await expect(grid).toHaveAttribute('aria-rowcount', String(seedRuns + 2))
})

test("an existing run's value updates live", async ({ page, api, example }) => {
  await openProposal(page, example)
  const trains = cell(page, { col: columnOf(example, 'n_trains'), row: 0 })

  // Wait for the seed value to land before pushing, so the page's own rows
  // cannot revert the update afterwards. The push then sets a value the seed
  // never had, so the cell text flipping to it proves the update rendered.
  await expect(trains).not.toBeEmpty()
  const updated = '999999'
  await expect(trains).not.toHaveText(updated)

  api.pushLatestData({
    metadata: fullMetadata(example.meta, XPCS.meta.runs),
    runs: { 1: { n_trains: { dtype: 'number', value: Number(updated) } } },
  })

  await expect(trains).toHaveText(updated)
})

test('a value changed during an outage shows once live updates reconnect', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  const trains = cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
  await expect(trains).not.toBeEmpty()
  const updated = '777777'
  await expect(trains).not.toHaveText(updated)

  // Live updates drop, and run 1 changes before they are back. No push carries
  // the change, so only asking again after the reconnect can find it.
  await api.dropLiveUpdates()
  api.editRuns({ 1: { n_trains: { dtype: 'number', value: Number(updated) } } })
  // The server's first tick after the subscribe pushes the metadata, and that
  // push is what sends the client to ask again.
  api.pushLatestData({
    metadata: fullMetadata(example.meta, XPCS.meta.runs),
    runs: {},
  })

  // The first retry waits up to 2 s, then page 1 loads again.
  await expect(trains).toHaveText(updated, { timeout: 10_000 })
})

test('the run beside a plot shows a value changed during an outage once live updates reconnect', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  const panel = page.getByRole('complementary', { name: 'Run' })
  await expect(selectedRunTab(page)).toHaveText('Run 1')
  await expect(panel.getByText(titleOf(example, 'n_trains'))).toBeVisible()
  const updated = '777777'
  await expect(panel.getByText(updated, { exact: true })).toHaveCount(0)

  // A plot of another variable takes the table's place, and the run stays
  // beside it on a wide screen.
  await openSummaryPlot(page, {
    example,
    col: columnOf(example, numberVars[1]),
  })
  await expect(plotEntries(page)).toHaveCount(1)
  await expect(selectedRunTab(page)).toHaveText('Run 1')

  // Live updates drop, and run 1's trains change before they are back. The
  // table is gone and the plot asks only for its own variable.
  await api.dropLiveUpdates()
  api.editRuns({ 1: { n_trains: { dtype: 'number', value: Number(updated) } } })
  api.pushLatestData({
    metadata: fullMetadata(example.meta, XPCS.meta.runs),
    runs: {},
  })

  await expect(panel.getByText(updated, { exact: true })).toBeVisible({
    timeout: 10_000,
  })
})

test('a proposal opened after leaving during an outage connects at once', async ({
  page,
  api,
  example,
}) => {
  test.slow()
  const proposal = example.proposalMetadata[0].number
  await openProposal(page, example)
  await expect.poll(() => api.connections()).toBe(1)

  // Drop live updates and refuse the next reconnects, so the waits grow
  await api.dropLiveUpdates({ refuse: REFUSALS })
  await expect
    .poll(() => api.connections(), { timeout: 15_000 })
    .toBe(1 + REFUSALS)

  // Leave for the home page while graphql-ws waits. With no proposal open it
  // gives up on that try at the end of the wait but keeps its back-off.
  await dashboardHeader(page).getByRole('link', { name: 'DAMNIT!' }).click()
  await expect(proposalLink(page, proposal)).toBeVisible()
  await page.waitForTimeout(WAIT_RUNS_OUT)

  // Open the proposal again
  await proposalLink(page, proposal).click()

  await expect
    .poll(() => api.connections(), { timeout: 5000 })
    .toBe(2 + REFUSALS)
})

test.describe('a deferred image resolves after its run finished', () => {
  test.use({ example: xpcsWithPendingImage })

  test('a still-extracting image cell fills in when the value arrives', async ({
    page,
    api,
    example,
  }) => {
    await openProposal(page, example)
    const imageCell = cell(page, IMAGE_CELL)
    const card = tooltipCard(page)
    const preview = card.locator('img')

    // Wait for the seed data to land (run 1's n_trains is populated) before
    // pushing, so the page's own rows cannot revert the image afterwards.
    await expect(
      cell(page, { col: columnOf(example, 'n_trains'), row: 0 })
    ).not.toBeEmpty()

    // Phase 1: still extracting, so the cell is a blank skeleton and hovering
    // shows no preview. Wait past the 200ms tooltip open delay, then the portal
    // stays empty (assert the whole portal, not just an <img>).
    await expect(imageCell).toBeEmpty()
    await hoverCell(page, { example, ...IMAGE_CELL, waitForContent: false })
    await page.waitForTimeout(400)
    await expect(card.locator(':scope > *')).toHaveCount(0)
    await moveAway(page)

    // Phase 2: extraction completes; the push fills the cell and the hover
    // preview appears.
    api.pushLatestData({
      metadata: fullMetadata(example.meta, XPCS.meta.runs),
      runs: { 1: { [IMAGE_VARIABLE]: { dtype: 'image', value: IMAGE_VALUE } } },
    })
    await waitForCellLoaded(page, IMAGE_CELL)
    await hoverCell(page, { example, ...IMAGE_CELL })
    await expect(preview).toBeVisible()
  })
})
