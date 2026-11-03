import { test, expect } from '#fixtures'
import { IMAGE_CELL, SPARKLINE_CELL, xpcsWithSparkline } from '#examples/xpcs'
import {
  WIDE_VIEWPORT,
  cellPoint,
  gridBox,
  threeQuartersAcross,
} from '#support/grid'
import {
  hoverCell,
  openProposal,
  tooltipCard,
  waitForCellLoaded,
} from '#support/table'

test.use({ example: xpcsWithSparkline, viewport: WIDE_VIEWPORT })

test('escape keeps the sparkline tooltip closed while moving within the cell', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const value = tooltipCard(page).getByText(/^y: /)

  // Sparkline cells mirror no content, so wait on the image cell, which loads
  // in the same heavy pass.
  await waitForCellLoaded(page, IMAGE_CELL)

  await hoverCell(page, { example, ...SPARKLINE_CELL, waitForContent: false })
  await expect(value).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(value).toBeHidden()

  // Move onto another point in the same cell, then wait past the 200ms open
  // delay: the tooltip stays closed.
  const box = await gridBox(page)
  const { y } = cellPoint(box, SPARKLINE_CELL)
  await page.mouse.move(threeQuartersAcross(box, SPARKLINE_CELL.col), y)
  await page.waitForTimeout(400)
  await expect(value).toBeHidden()
})
