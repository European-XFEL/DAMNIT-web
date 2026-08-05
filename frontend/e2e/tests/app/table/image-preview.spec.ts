import { test, expect } from '#fixtures'
import { IMAGE_CELL } from '#examples/xpcs'
import {
  hoverCell,
  moveAway,
  openProposal,
  rightClickCell,
  tooltipCard,
  waitForCellLoaded,
} from '#support/table'

// A wide viewport keeps the first image column within the horizontal fold.
test.use({ viewport: { width: 1600, height: 900 } })

// The Run column is always present, always non-empty, and is neither an error
// nor an image cell, so it never resolves a tooltip.
const PLAIN_CELL = { col: 1, row: 0 }

test('hovering an image cell shows a preview that clears on mouse-out', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const preview = tooltipCard(page).locator('img')

  // Hover the thumbnail: the enlarged preview appears.
  await hoverCell(page, IMAGE_CELL)
  await expect(preview).toBeVisible()

  // Move off the grid: the preview clears.
  await moveAway(page)
  await expect(preview).toBeHidden()
})

test('right-clicking an image cell dismisses the preview and opens the context menu', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const preview = tooltipCard(page).locator('img')

  // Hover the thumbnail so the preview is showing.
  await hoverCell(page, IMAGE_CELL)
  await expect(preview).toBeVisible()

  // Right-click the same cell: the preview clears and the plot menu opens.
  await rightClickCell(page, IMAGE_CELL)
  await expect(preview).toBeHidden()
  await expect(page.getByText('Plot: preview')).toBeVisible()
})

test('hovering a cell with no supported tooltip shows nothing', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const card = tooltipCard(page)

  // Wait for table data to load; the image cell mirrors its src once ready.
  await waitForCellLoaded(page, IMAGE_CELL)

  // Cold-hover a plain Run cell, which schedules no tooltip. Wait past the
  // 200ms open delay, then the portal is still empty (no card, no image layer).
  await hoverCell(page, PLAIN_CELL, { waitForContent: false })
  await page.waitForTimeout(400)
  await expect(card.locator(':scope > *')).toHaveCount(0)

  // Control: an image cell in the same grid still shows its preview, proving
  // the tooltip path is live and the empty portal was not a dead pointer.
  await hoverCell(page, IMAGE_CELL)
  await expect(card.locator('img')).toBeVisible()
})
