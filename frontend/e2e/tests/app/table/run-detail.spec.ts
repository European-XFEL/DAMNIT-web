import { test, expect } from '#fixtures'
import {
  closeAside,
  openProposal,
  highlightedRow,
  selectRun,
  selectedRunTab,
} from '#support/table'

test('selecting a run shows all its variables', async ({ page, example }) => {
  await openProposal(page, example)
  await expect(selectedRunTab(page)).toHaveCount(0)

  // The first row is run 1 in the XPCS example.
  await selectRun(page, { example, row: 0 })

  const panel = page.getByRole('complementary')
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(panel.getByText('Sample type')).toBeVisible()
  await expect(panel.getByText('silica')).toBeVisible()
  await expect(panel.getByText('XGM intensity [uJ]')).toBeVisible()
  // The four XPCS variables render as image thumbnails in the panel.
  await expect(panel.locator('img')).toHaveCount(4)
})

test('selecting another run replaces the selection', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Select the first run
  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  // Select the second run
  await selectRun(page, { example, row: 1 })
  await expect(selectedRunTab(page)).toContainText('Run: 2')
  // Single row selection: the panel follows the run, it does not stack tabs.
  await expect(selectedRunTab(page)).toHaveCount(1)
})

// The aside shows the selected run and owns nothing of its own, so closing it is
// how a user deselects: a highlighted row beside a closed panel means nothing.
test('closing the aside clears the run selection', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(highlightedRow(page, { row: 0 })).toBeAttached()

  await closeAside(page)

  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})
