import { test, expect } from '#fixtures/production'
import { hoverCell, tooltipCard } from '#support/table'
import { columnOfTitle, openMockProposal } from '#support/real-api'

test("hovering a figure's thumbnail shows the figure enlarged", async ({
  page,
}) => {
  await openMockProposal(page)

  await hoverCell(page, {
    col: await columnOfTitle(page, 'Trace plot'),
    row: 0,
  })

  await expect(tooltipCard(page).locator('img')).toBeVisible()
})
