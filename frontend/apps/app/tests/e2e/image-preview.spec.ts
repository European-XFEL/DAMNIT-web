import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  hoverCell,
  tooltipCard,
} from '@damnit-frontend/testing/playwright/table'
import { columnOfTitle, openMockProposal } from '#tests/e2e/support/real-api'

test("hovering a figure's thumbnail shows the figure enlarged", async ({
  page,
}) => {
  await openMockProposal(page)

  await hoverCell(page, {
    col: await columnOfTitle(page, 'Trace plot (matplotlib)'),
    row: 0,
  })

  await expect(tooltipCard(page).locator('img')).toBeVisible()
})
