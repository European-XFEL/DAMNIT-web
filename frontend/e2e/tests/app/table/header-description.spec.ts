import { test, expect } from '#fixtures'
import { WIDE_VIEWPORT, gridBox, headerPoint } from '#support/grid'
import {
  clickAndExpectColumn,
  columnOf,
  hasGroups,
  hoverHeader,
  openProposal,
  titleOf,
  tooltipCard,
} from '#support/table'

// Room for the card on the header's right, where it covers the next headers.
test.use({ viewport: WIDE_VIEWPORT })

test('hovering a column header shows its description with its line breaks', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const col = columnOf(example, 'xgm_intensity')
  const card = tooltipCard(page).getByText(/^Pulse energy measured/)

  await hoverHeader(page, { example, col })
  await expect(card).toBeVisible()
  // innerText keeps the line breaks that toHaveText would fold into spaces.
  await expect(card).toHaveJSProperty(
    'innerText',
    example.meta.variables.xgm_intensity.description
  )
})

test('a click on the header under a description card selects that header', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const col = columnOf(example, 'xgm_intensity')
  const card = tooltipCard(page).getByText(/^Pulse energy measured/)
  await hoverHeader(page, { example, col })
  await expect(card).toBeVisible()

  const next = headerPoint(await gridBox(page), {
    col: columnOf(example, 'total_transmission'),
    grouped: hasGroups(example),
  })
  // The point lies under the card, so only a card that lets it through
  // passes the click on to the header.
  const box = await card.boundingBox()
  if (!box) {
    throw new Error('the description card has no box')
  }

  expect(next.x).toBeGreaterThan(box.x)
  expect(next.x).toBeLessThan(box.x + box.width)
  expect(next.y).toBeGreaterThan(box.y)
  expect(next.y).toBeLessThan(box.y + box.height)

  await clickAndExpectColumn(page, {
    point: next,
    title: titleOf(example, 'total_transmission'),
  })
})

test('a drag across the headers opens no description card', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const col = columnOf(example, 'xgm_intensity')
  const card = tooltipCard(page).getByText(/^Pulse energy measured/)
  const box = await gridBox(page)
  const grouped = hasGroups(example)
  const start = headerPoint(box, { col: col - 1, grouped })
  const end = headerPoint(box, { col, grouped })

  // Wait past the 200ms open delay.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.waitForTimeout(400)
  await expect(card).toBeHidden()
  await page.mouse.up()

  await page.mouse.move(0, 0)
  await hoverHeader(page, { example, col })
  await expect(card).toBeVisible()
})
