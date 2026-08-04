import { test, expect } from '#fixtures'
import {
  XPCS,
  IMAGE_CELL,
  IMAGE_VARIABLE,
  IMAGE_VALUE,
  xpcsWithPendingImage,
} from '#examples/xpcs'
import {
  cell,
  columnOf,
  hoverCell,
  moveAway,
  openProposal,
  tooltipCard,
  waitForCellLoaded,
} from '#support/table'

// A wide viewport keeps the image column within the horizontal fold, matching
// image-preview.spec. Every updated run sits in the initial vertical fold.
test.use({ viewport: { width: 1600, height: 900 } })

// A subscription push carries the full metadata snapshot: runs, variables, and
// tags. The client replaces its metadata wholesale, exactly as the backend
// sends it, so the push carries tags too. The mock stamps the timestamp; runs
// stays numeric to match the seed, and a caller overrides it to add a run.
function fullMetadata(runs: number[]) {
  return { runs, variables: XPCS.meta.variables, tags: XPCS.meta.tags }
}

test('a finished run appears as a new row', async ({ page, api, example }) => {
  await openProposal(page, example)
  const grid = page.locator('[role="grid"]')
  const seedRuns = XPCS.meta.runs.length

  // Wait for the seed's data to land before pushing, so the page's own rows
  // cannot revert the new run afterwards. Gate on a populated cell, not
  // aria-rowcount: the metadata query fills runs (and the row count) with no
  // cell data, so the row count can reach seedRuns + 1 before the rows land.
  await expect(
    cell(page, { col: columnOf('n_trains'), row: 0 })
  ).not.toBeEmpty()

  // aria-rowcount counts the header row too, so the seed shows seedRuns + 1.
  await expect(grid).toHaveAttribute('aria-rowcount', String(seedRuns + 1))

  const newRun = XPCS.meta.runs[seedRuns - 1] + 1
  api.pushLatestData({
    metadata: fullMetadata([...XPCS.meta.runs, newRun]),
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
  const trains = cell(page, { col: columnOf('n_trains'), row: 0 })

  // Wait for the seed value to land before pushing, so the page's own rows
  // cannot revert the update afterwards. The push then sets a value the seed
  // never had, so the cell text flipping to it proves the update rendered.
  await expect(trains).not.toBeEmpty()
  const updated = '999999'
  await expect(trains).not.toHaveText(updated)

  api.pushLatestData({
    metadata: fullMetadata(XPCS.meta.runs),
    runs: { 1: { n_trains: { dtype: 'number', value: Number(updated) } } },
  })

  await expect(trains).toHaveText(updated)
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
      cell(page, { col: columnOf('n_trains'), row: 0 })
    ).not.toBeEmpty()

    // Phase 1: still extracting, so the cell is a blank skeleton and hovering
    // shows no preview. Wait past the 200ms tooltip open delay, then the portal
    // stays empty (assert the whole portal, not just an <img>).
    await expect(imageCell).toBeEmpty()
    await hoverCell(page, IMAGE_CELL, { waitForContent: false })
    await page.waitForTimeout(400)
    await expect(card.locator(':scope > *')).toHaveCount(0)
    await moveAway(page)

    // Phase 2: extraction completes; the push fills the cell and the hover
    // preview appears.
    api.pushLatestData({
      metadata: fullMetadata(XPCS.meta.runs),
      runs: { 1: { [IMAGE_VARIABLE]: { dtype: 'image', value: IMAGE_VALUE } } },
    })
    await waitForCellLoaded(page, IMAGE_CELL)
    await hoverCell(page, IMAGE_CELL)
    await expect(preview).toBeVisible()
  })
})
