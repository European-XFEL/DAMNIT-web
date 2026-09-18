import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { type Example } from '#examples/xpcs'
import {
  COLUMN_WIDTH,
  WIDE_VIEWPORT,
  columnCenter,
  dragBy,
  gridBox,
  threeQuartersAcross,
  waitOutDoubleClick,
} from '#support/grid'
import { selectColumns } from '#support/plots'
import {
  clickAndExpectColumn,
  columnOf,
  headerEdge,
  openProposal,
  selectedColumnHeaders,
  titleOf,
} from '#support/table'

test.use({ viewport: WIDE_VIEWPORT })

test('dragging a header edge widens the column behind it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const trains = columnOf(example, 'n_trains')
  const box = await gridBox(page)
  const edge = await headerEdge(page, { example, col: trains })
  // The middle of the next column along, which a widened Trains has to swallow
  // for this point to change hands.
  const probe = { x: columnCenter(box, trains + 1), y: edge.y }

  // Before the drag the point belongs to the next column.
  await clickAndExpectColumn(page, {
    point: probe,
    title: titleOf(example, 'n_pulses'),
  })
  await waitOutDoubleClick(page)

  await dragBy(page, { from: edge, by: { x: COLUMN_WIDTH, y: 0 } })

  await clickAndExpectColumn(page, {
    point: probe,
    title: titleOf(example, 'n_trains'),
  })
})

// The grid sizes itself to the sum of its column widths, so the canvas grows by
// what the fit added to the column's default.
async function fitColumn(
  page: Page,
  { example, col }: { example: Example; col: number }
): Promise<number> {
  const edge = await headerEdge(page, { example, col })
  const before = (await gridBox(page)).width

  await page.mouse.dblclick(edge.x, edge.y)

  await expect
    .poll(async () => (await gridBox(page)).width)
    .toBeGreaterThan(before)
  await waitOutDoubleClick(page)
  return COLUMN_WIDTH + (await gridBox(page)).width - before
}

// Glide measures the visible cells and the whole title, which is what makes a
// clipped title readable again.
test('double-clicking a header edge fits the column to its title', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The default width clips this title.
  const xgm = columnOf(example, 'xgm_intensity')
  const edge = await headerEdge(page, { example, col: xgm })

  await fitColumn(page, { example, col: xgm })

  // Ten past the old seam, clear of Glide's 5 px edge zone. XGM covers it at
  // 116 px or more; the fit gives 123, a 107 px title plus 16.
  await clickAndExpectColumn(page, {
    point: { x: edge.x + 10, y: edge.y },
    title: titleOf(example, 'xgm_intensity'),
  })
})

// Glide re-sends a drag to every column in the selection, which would make the
// two columns of a half-built plot resize together.
test('resizing one of several selected columns leaves the others alone', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const trains = columnOf(example, 'n_trains')
  const pulses = columnOf(example, 'n_pulses')
  const edge = await headerEdge(page, { example, col: trains })

  await selectColumns(page, { example, cols: [trains, pulses] })
  await expect(selectedColumnHeaders(page)).toHaveText([
    titleOf(example, 'n_trains'),
    titleOf(example, 'n_pulses'),
  ])
  await waitOutDoubleClick(page)

  await dragBy(page, { from: edge, by: { x: COLUMN_WIDTH, y: 0 } })

  // Pulses slid a column to the right but kept its width, so this point now sits
  // past its far edge. A Pulses that widened too would still be holding it.
  const probe = { x: edge.x + COLUMN_WIDTH * 2.5, y: edge.y }
  await clickAndExpectColumn(page, {
    point: probe,
    title: titleOf(example, 'sample_type'),
  })
})

// A press and release on the seam with no movement between them. Glide reads
// that as a resize to nothing and hands the others its minimum width.
test('clicking a header edge without dragging leaves the other selected columns alone', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const trains = columnOf(example, 'n_trains')
  const pulses = columnOf(example, 'n_pulses')
  const box = await gridBox(page)
  const edge = await headerEdge(page, { example, col: trains })

  await selectColumns(page, { example, cols: [trains, pulses] })
  await waitOutDoubleClick(page)

  await page.mouse.click(edge.x, edge.y)

  await clickAndExpectColumn(page, {
    point: { x: threeQuartersAcross(box, pulses), y: edge.y },
    title: titleOf(example, 'n_pulses'),
  })
})

test.describe('a viewport wide enough for a fitted table', () => {
  // The canvas clamps to its container, so a narrower one would measure the fold.
  test.use({ viewport: { width: 3400, height: 900 } })

  test('fitting from the toolbar reaches every column, hand-set ones included', async ({
    page,
    example,
  }) => {
    await openProposal(page, example)

    // Fit a table nobody has touched. The grid sizes itself to the sum of its
    // column widths, so the canvas is what a full sweep measures to.
    const before = (await gridBox(page)).width
    await page.getByRole('button', { name: 'Fit all columns' }).click()
    await expect
      .poll(async () => (await gridBox(page)).width)
      .toBeGreaterThan(before)
    const fitted = (await gridBox(page)).width

    // Put the widths back, then set one of them by hand.
    await page.getByRole('button', { name: 'Reset column widths' }).click()
    await expect.poll(async () => (await gridBox(page)).width).toBe(before)
    await waitOutDoubleClick(page)
    const edge = await headerEdge(page, {
      example,
      col: columnOf(example, 'n_pulses'),
    })
    await dragBy(page, { from: edge, by: { x: COLUMN_WIDTH, y: 0 } })

    // Fitting again reaches every column, so the hand-set width is measured
    // away and the total is the one a clean sweep landed on.
    await page.getByRole('button', { name: 'Fit all columns' }).click()
    await expect.poll(async () => (await gridBox(page)).width).toBe(fitted)
  })
})

test('resetting from the toolbar puts every width back to the default', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const before = (await gridBox(page)).width
  const edge = await headerEdge(page, {
    example,
    col: columnOf(example, 'n_trains'),
  })

  // Widen one column by hand.
  await dragBy(page, { from: edge, by: { x: COLUMN_WIDTH, y: 0 } })
  await expect
    .poll(async () => (await gridBox(page)).width)
    .toBeGreaterThan(before)

  // Put every width back.
  await page.getByRole('button', { name: 'Reset column widths' }).click()
  await expect.poll(async () => (await gridBox(page)).width).toBe(before)
})
