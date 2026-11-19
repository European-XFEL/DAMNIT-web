import { test, expect } from '#fixtures/production'
import { hoverCell, tooltipCard } from '#support/table'
import {
  ALL_VALUE_TYPES,
  columnOfTitle,
  openMockProposal,
} from '#support/real-api'

test("hovering a figure's thumbnail shows the figure enlarged", async ({
  page,
}) => {
  await openMockProposal(page)

  await hoverCell(page, {
    example: ALL_VALUE_TYPES,
    col: await columnOfTitle(page, 'Trace plot'),
    row: 0,
  })

  await expect(tooltipCard(page).locator('img')).toBeVisible()
})
