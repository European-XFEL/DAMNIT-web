import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import { xpcsWithGroups } from '#examples/xpcs'
import {
  canScroll,
  cellPoint,
  COLUMN_WIDTH,
  gridBox,
  gridCanvas,
  gridScroller,
  lineStrength,
  type Box,
  type Point,
} from '#support/grid'
import { columnOf, hasGroups, openProposal } from '#support/table'

// Glide scrolls in whole columns. One is enough for its visible positions to
// part from the source columns, and it puts Pulses, not an edge, at the freeze.
const SCROLL = COLUMN_WIDTH

// An edge line is gray.3, 33 levels under the white beside it; an inner line
// is 7, and no line at all is 0. Only an edge clears this.
const MIN_EDGE_STRENGTH = 18

const SAMPLE_COLUMN = columnOf(xpcsWithGroups, 'sample.type')

test.use({ example: xpcsWithGroups })

async function scrollSideways(page: Page) {
  await expect.poll(() => canScroll(page, 'horizontal')).toBe(true)
  await gridScroller(page).evaluate((scroller: HTMLElement, left: number) => {
    scroller.scrollLeft = left
  }, SCROLL)
}

// A scroll shifts the old frame sideways and draws only the new strip, which
// carries old lines along. A resize makes Glide draw the whole frame again.
async function redrawInFull(page: Page) {
  const size = page.viewportSize()
  if (!size) {
    throw new Error('the page has no viewport to resize')
  }
  // Glide sizes the canvas in the same call that draws it, so the width
  // coming back means the frame at the old size is drawn.
  const canvasWidth = () =>
    gridCanvas(page).evaluate((canvas: HTMLCanvasElement) => canvas.width)
  const width = await canvasWidth()

  await page.setViewportSize({ ...size, width: size.width + 1 })
  await expect.poll(canvasWidth).not.toBe(width)
  await page.setViewportSize(size)
  await expect.poll(canvasWidth).toBe(width)
}

// The line on the left of `col`, on the second row of an unscrolled grid.
function leftLinePoint(
  box: Box,
  { col, grouped }: { col: number; grouped: boolean }
): Point {
  const cell = cellPoint(box, { col, row: 1, grouped })
  return { x: cell.x - COLUMN_WIDTH / 2, y: cell.y }
}

test('the pinned edge stays drawn while the grid scrolls sideways', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const box = await gridBox(page)
  await scrollSideways(page)

  // Run is the one pinned column, so the edge is on the left of column 2.
  const pinnedEdge = leftLinePoint(box, {
    col: 2,
    grouped: hasGroups(example),
  })
  await expect
    .poll(() => lineStrength(page, pinnedEdge))
    .toBeGreaterThan(MIN_EDGE_STRENGTH)
})

test('a group edge stays on its column when a scrolled grid redraws', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const box = await gridBox(page)
  await scrollSideways(page)
  await redrawInFull(page)

  const groupStart = leftLinePoint(box, {
    col: SAMPLE_COLUMN,
    grouped: hasGroups(example),
  })
  const groupEdge = { ...groupStart, x: groupStart.x - SCROLL }
  await expect
    .poll(() => lineStrength(page, groupEdge))
    .toBeGreaterThan(MIN_EDGE_STRENGTH)
})
