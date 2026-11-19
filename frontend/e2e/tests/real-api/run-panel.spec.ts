import { test, expect } from '#fixtures/production'
import { selectedRunTab, selectRun } from '#support/table'
import { ALL_VALUE_TYPES, openMockProposal, RUNS } from '#support/real-api'

test('selecting a run shows its values in the run panel', async ({ page }) => {
  await openMockProposal(page)

  await selectRun(page, { example: ALL_VALUE_TYPES, row: RUNS.indexOf(3) })

  const panel = page.getByRole('complementary')
  await expect(selectedRunTab(page)).toHaveText('Run 3')
  await expect(panel.getByText('Sample 003')).toBeVisible()
  await expect(panel.getByText('103', { exact: true })).toBeVisible()
})
