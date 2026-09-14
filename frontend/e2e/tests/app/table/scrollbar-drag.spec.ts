import { test, expect } from '#fixtures'
import {
  REAL_SCROLLBARS,
  canScroll,
  dragBy,
  gridScroller,
  scrollbarThumb,
} from '#support/grid'
import { openProposal } from '#support/table'

// Small enough that the example's columns overflow sideways and its rows
// overflow downwards, so the grid has both scrollbars and somewhere to scroll.
test.use({ viewport: { width: 900, height: 400 }, ...REAL_SCROLLBARS })

// Glide autoscrolls a drag that strays outside the grid, and speeds up the
// longer the button is held. Hold before releasing so a regression shows.
const AUTOSCROLL_HOLD = 300

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

  await dragBy(page, {
    from: await scrollbarThumb(page, 'horizontal'),
    by: { x: 150, y: 0 },
    hold: AUTOSCROLL_HOLD,
  })

  await expect(scroller).not.toHaveJSProperty('scrollLeft', 0)
  await expect(scroller).toHaveJSProperty('scrollTop', 0)
})

test('dragging along the vertical scrollbar leaves the horizontal scroll alone', async ({
  page,
}) => {
  const scroller = gridScroller(page)

  await dragBy(page, {
    from: await scrollbarThumb(page, 'vertical'),
    by: { x: 0, y: 60 },
    hold: AUTOSCROLL_HOLD,
  })

  await expect(scroller).not.toHaveJSProperty('scrollTop', 0)
  await expect(scroller).toHaveJSProperty('scrollLeft', 0)
})
