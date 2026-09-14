import { test, expect } from '#fixtures'
import {
  COLUMN_WIDTH,
  REAL_SCROLLBARS,
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
  lastVariableOf,
  openProposal,
  selectedColumnHeaders,
  titleOf,
} from '#support/table'

// Every gesture here aims at the dead strip beside the last column, which is
// only there when scrollbars take layout space.
test.use({ viewport: WIDE_VIEWPORT, ...REAL_SCROLLBARS })

// Far enough past the seam that Glide calls the press out of bounds, inside the
// 5px it still reads as the last column's edge.
const EDGE_OVERSHOOT = 2

// The press lands in the dead strip, so Glide starts the resize down its
// out-of-bounds path, which does not say which column was grabbed.
test('clicking past the last column leaves the other selected columns alone', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const trains = columnOf(example, 'n_trains')
  const last = columnOf(example, lastVariableOf(example))
  const box = await gridBox(page)
  const edge = await headerEdge(page, {
    example,
    col: last,
    overshoot: EDGE_OVERSHOOT,
  })

  await selectColumns(page, { example, cols: [last, trains] })
  await expect(selectedColumnHeaders(page)).toHaveText([
    titleOf(example, 'n_trains'),
    titleOf(example, lastVariableOf(example)),
  ])
  await waitOutDoubleClick(page)

  await page.mouse.click(edge.x, edge.y)

  await clickAndExpectColumn(page, {
    point: { x: threeQuartersAcross(box, trains), y: edge.y },
    title: titleOf(example, 'n_trains'),
  })
})

test('dragging past the last column resizes only the column behind it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  const trains = columnOf(example, 'n_trains')
  const pulses = columnOf(example, 'n_pulses')
  const last = columnOf(example, lastVariableOf(example))
  const box = await gridBox(page)
  const edge = await headerEdge(page, {
    example,
    col: last,
    overshoot: EDGE_OVERSHOOT,
  })

  await selectColumns(page, { example, cols: [last, trains] })
  await waitOutDoubleClick(page)

  await dragBy(page, { from: edge, by: { x: COLUMN_WIDTH, y: 0 } })

  // The grid is sized to its columns, so the drag has to have widened it.
  expect((await gridBox(page)).width).toBeGreaterThan(box.width)

  // Trains sits left of the drag, so nothing legitimate moves it. Handed the
  // dragged width it would have swallowed the centre of Pulses next door.
  await clickAndExpectColumn(page, {
    point: { x: columnCenter(box, pulses), y: edge.y },
    title: titleOf(example, 'n_pulses'),
  })
})
