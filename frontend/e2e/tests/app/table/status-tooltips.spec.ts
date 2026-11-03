import { test, expect } from '#fixtures'
import { ERROR_CELLS, ERROR_ROW, xpcsWithErrors } from '#examples/xpcs'
import { WIDE_VIEWPORT } from '#support/grid'
import { hoverCell, openProposal, tooltipCard } from '#support/table'

// Run 1 fails in three ways (see the XPCS fixture for the dependency story), one
// per status-card kind.
test.use({ example: xpcsWithErrors, viewport: WIDE_VIEWPORT })

for (const cell of ERROR_CELLS) {
  test(`hovering the failed ${cell.variable} cell shows its "${cell.title}" card`, async ({
    page,
    example,
  }) => {
    await openProposal(page, example)

    await hoverCell(page, { example, col: cell.col, row: ERROR_ROW })

    // The card names the failure, its exception class, and the message.
    const card = tooltipCard(page)
    await expect(card.getByText(cell.title, { exact: true })).toBeVisible()
    await expect(card.getByText(cell.error.cls, { exact: true })).toBeVisible()
    await expect(
      card.getByText(cell.error.message.split('\n')[0])
    ).toBeVisible()
  })
}

const [first, second] = ERROR_CELLS

test(`moving from the ${first.variable} cell to the ${second.variable} cell swaps the card content`, async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const card = tooltipCard(page)

  // Hover the first errored cell: its card shows.
  await hoverCell(page, { example, col: first.col, row: ERROR_ROW })
  await expect(card.getByText(first.title, { exact: true })).toBeVisible()

  // Move to the second errored cell: its card replaces the first one.
  await hoverCell(page, { example, col: second.col, row: ERROR_ROW })
  await expect(card.getByText(second.title, { exact: true })).toBeVisible()
  await expect(card.getByText(second.error.cls, { exact: true })).toBeVisible()
  await expect(card.getByText(first.title, { exact: true })).toBeHidden()
})
