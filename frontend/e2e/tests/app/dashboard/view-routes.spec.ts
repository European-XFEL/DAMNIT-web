import { test, expect } from '#fixtures'
import { numberVars } from '#examples/xpcs'
import { openContextFile } from '#support/context-file'
import { allRunsNavItem } from '#support/dashboard'
import { closePlot, plotEntry, plotFigure } from '#support/plots'
import { openProposal, titleOf } from '#support/table'

test('the context file stays open over a reload, and Back lands on All runs', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openContextFile(page)
  await expect(page).toHaveURL(/\/context-file$/)

  // Reload
  await page.reload()
  await expect(page.locator('.view-line').first()).toBeVisible()

  // Back
  await page.goBack()
  await expect(page).toHaveURL(/\/table$/)
  await expect(allRunsNavItem(page)).toHaveAttribute('aria-current', 'page')
})

test('a plot link opened fresh draws the plot and lists it, and Back after closing it opens it again', async ({
  page,
  example,
}) => {
  const proposal = example.proposalMetadata[0].number
  const y = numberVars[0]
  const name = `${titleOf(example, y)} vs. Run`

  await page.goto(`proposal/${proposal}/plots/summary?x=run&y=${y}`)
  await expect(plotFigure(page)).toBeVisible()
  await expect(plotEntry(page, name)).toHaveAttribute('aria-current', 'page')

  // Close it
  await closePlot(page, name)
  await expect(page).toHaveURL(/\/table$/)
  await expect(plotEntry(page, name)).toHaveCount(0)

  // Back
  await page.goBack()
  await expect(plotFigure(page)).toBeVisible()
  await expect(plotEntry(page, name)).toHaveAttribute('aria-current', 'page')
})
