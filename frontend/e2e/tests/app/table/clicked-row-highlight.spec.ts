import { test, expect } from '#fixtures'
import {
  cellPoint,
  COLUMN_WIDTH,
  gridBox,
  gridCanvas,
  pixelColor,
  ROW_HEIGHT,
  WIDE_VIEWPORT,
} from '#support/grid'
import {
  columnOf,
  hasGroups,
  openProposal,
  selectedRunTab,
} from '#support/table'

test.use({ viewport: WIDE_VIEWPORT })

const WHITE = [255, 255, 255]

// With no run open, clicking a cell highlights its row but doesn't select the
// run or open the aside.
test('a clicked cell highlights its row without opening the run', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const box = await gridBox(page)
  const grouped = hasGroups(example)
  const runCol = columnOf(example, 'run')
  const otherCol = columnOf(example, 'n_trains')

  const clickRow = (row: number) => {
    const { x, y } = cellPoint(box, { col: runCol, row, grouped })
    return page.mouse.click(x, y)
  }

  // A point near the top-left corner of a cell in another column, away from
  // its text and borders.
  const backgroundOf = (row: number) => {
    const { x, y } = cellPoint(box, { col: otherCol, row, grouped })
    return pixelColor(gridCanvas(page), {
      x: x - COLUMN_WIDTH / 2 + 4,
      y: y - ROW_HEIGHT / 2 + 4,
    })
  }

  await clickRow(1)
  await expect.poll(() => backgroundOf(1)).not.toEqual(WHITE)
  expect(await backgroundOf(0)).toEqual(WHITE)
  expect(await backgroundOf(2)).toEqual(WHITE)
  await expect(selectedRunTab(page)).toHaveCount(0)

  await clickRow(3)
  await expect.poll(() => backgroundOf(3)).not.toEqual(WHITE)
  await expect.poll(() => backgroundOf(1)).toEqual(WHITE)
})
