import { test, expect } from '#fixtures'
import { numberVars } from '#examples/xpcs'
import { openContextFile } from '#support/context-file'
import { allRunsNavItem, dashboardNav } from '#support/dashboard'
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

test('a link to no page keeps the dashboard and says so, with a way to All runs', async ({
  page,
  example,
}) => {
  const proposal = example.proposalMetadata[0].number

  await page.goto(`proposal/${proposal}/tabel`)
  await expect(
    page.getByText('The proposal has no page "tabel".')
  ).toBeVisible()
  await expect(dashboardNav(page)).toBeVisible()

  await page.getByRole('link', { name: 'Open All runs' }).click()
  await expect(page).toHaveURL(/\/table$/)
})

test("a plot link to none of the proposal's runs says so in the view's place", async ({
  page,
  example,
}) => {
  const proposal = example.proposalMetadata[0].number
  const y = numberVars[0]

  await page.goto(
    `proposal/${proposal}/plots/summary?x=run&y=${y}&runs=900-901`
  )
  await expect(
    page.getByText('The proposal has none of the runs 900-901')
  ).toBeVisible()
  await expect(dashboardNav(page)).toBeVisible()
  await expect(plotEntry(page, `${titleOf(example, y)} vs. Run`)).toHaveCount(0)
})
