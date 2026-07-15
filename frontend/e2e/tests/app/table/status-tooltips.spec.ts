import { test, expect } from '#fixtures'

import { ERROR_CELLS, ERROR_ROW, xpcsWithErrors } from '#examples/xpcs'
import { hoverCell, openProposal, tooltipCard } from '#support/table'

// Run 1 fails in three ways (see the XPCS fixture for the dependency story), one
// per status-card kind. A wide viewport keeps every errored column in the fold.
test.use({ example: xpcsWithErrors, viewport: { width: 1600, height: 900 } })

for (const cell of ERROR_CELLS) {
  test(`hovering the failed ${cell.variable} cell shows its "${cell.title}" card`, async ({
    page,
  }) => {
    await openProposal(page)

    await hoverCell(page, { col: cell.col, row: ERROR_ROW })

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
}) => {
  await openProposal(page)
  const card = tooltipCard(page)

  // Hover the first errored cell: its card shows.
  await hoverCell(page, { col: first.col, row: ERROR_ROW })
  await expect(card.getByText(first.title, { exact: true })).toBeVisible()

  // Move to the second errored cell: its card replaces the first one.
  await hoverCell(page, { col: second.col, row: ERROR_ROW })
  await expect(card.getByText(second.title, { exact: true })).toBeVisible()
  await expect(card.getByText(second.error.cls, { exact: true })).toBeVisible()
  await expect(card.getByText(first.title, { exact: true })).toBeHidden()
})
