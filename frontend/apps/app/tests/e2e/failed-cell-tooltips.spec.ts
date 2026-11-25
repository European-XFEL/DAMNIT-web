import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  hoverCell,
  tooltipCard,
} from '@damnit-frontend/testing/playwright/table'
import {
  columnOfTitle,
  openMockProposal,
  RUNS,
} from '#tests/e2e/support/real-api'

// The app suite covers each kind of failure, and the API's tests each message.
test("hovering run 2's failed Fit cell shows DAMNIT's error", async ({
  page,
}) => {
  await openMockProposal(page)

  await hoverCell(page, {
    col: await columnOfTitle(page, 'Fit'),
    row: RUNS.indexOf(2),
  })

  const card = tooltipCard(page)
  await expect(card.getByText('Error', { exact: true })).toBeVisible()
  await expect(card.getByText('ValueError', { exact: true })).toBeVisible()
  await expect(card.getByText('fit did not converge')).toBeVisible()
})
