import { test, expect } from '#fixtures'
import { openContextFile } from '#support/context-file'
import { statusBar } from '#support/dashboard'
import { openProposal } from '#support/table'

// The mock's context file was last modified at 22:13:20 UTC on 14 November
// 2023, more than a week ago, so the bar shows its date.
test.use({ timezoneId: 'UTC' })

test('each view puts its own fact in the status bar', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const bar = statusBar(page)

  // The table counts its runs
  await expect(bar.getByText(`${example.meta.runs.length} runs`)).toBeVisible()

  // The context file says when it changed, and the run count leaves
  await openContextFile(page)
  const modified = bar.getByText('Modified: 14 November 2023')
  await expect(modified).toBeVisible()
  await expect(bar).not.toContainText('runs')

  // Its tooltip has the exact time
  await modified.hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    'Modified 14 November 2023 at 22:13:20'
  )
})

test('the status bar says the proposal is read-only and where to edit it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await statusBar(page).getByRole('img', { name: 'Read-only' }).hover()

  await expect(page.getByRole('tooltip')).toHaveText(
    'Read-only. To edit comments or the context file, or to reprocess runs, use the DAMNIT GUI.'
  )
})
