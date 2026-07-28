import { type Page } from '@playwright/test'

import { test, expect } from '#fixtures'
import {
  canScroll,
  gridScroller,
  scrollbarThumb,
  type Point,
} from '#support/grid'
import { openProposal } from '#support/table'

// Small enough that the example's columns overflow sideways and its rows
// overflow downwards, so the grid has both scrollbars and somewhere to scroll.
test.use({
  viewport: { width: 900, height: 400 },
  // Headless Chromium hides scrollbars by default, leaving only overlay ones,
  // which take no layout space and so cannot be pressed.
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
})

test.beforeEach(async ({ page, example }) => {
  await openProposal(page, example)

  // Dragging one scrollbar only proves something about the other axis if the
  // grid could have scrolled that way in the first place.
  await expect.poll(() => canScroll(page, 'horizontal')).toBe(true)
  await expect.poll(() => canScroll(page, 'vertical')).toBe(true)
})

test('dragging along the horizontal scrollbar leaves the vertical scroll alone', async ({
  page,
}) => {
  const scroller = gridScroller(page)

  await dragThumb(page, {
    from: await scrollbarThumb(page, 'horizontal'),
    by: { x: 150, y: 0 },
  })

  await expect(scroller).not.toHaveJSProperty('scrollLeft', 0)
  await expect(scroller).toHaveJSProperty('scrollTop', 0)
})

test('dragging along the vertical scrollbar leaves the horizontal scroll alone', async ({
  page,
}) => {
  const scroller = gridScroller(page)

  await dragThumb(page, {
    from: await scrollbarThumb(page, 'vertical'),
    by: { x: 0, y: 60 },
  })

  await expect(scroller).not.toHaveJSProperty('scrollTop', 0)
  await expect(scroller).toHaveJSProperty('scrollLeft', 0)
})

// Glide autoscrolls a drag that strays outside the grid, and speeds up the
// longer the button is held. Hold before releasing so a regression shows.
async function dragThumb(page: Page, { from, by }: { from: Point; by: Point }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  await page.waitForTimeout(300)
  await page.mouse.up()
}
