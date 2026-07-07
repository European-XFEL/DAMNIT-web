import { test, expect } from '#fixtures'

import { XPCS } from '#examples/xpcs'
import { openProposal } from '#support/table'
import {
  chooseVariable,
  openPlotDialog,
  plotFigure,
  plotTab,
  submitPlot,
} from '#support/plots'

// Match the other plot specs' viewport; it is also above Mantine's `sm`
// breakpoint, below which the tab bar (with the Display Plot button) is hidden.
test.use({ viewport: { width: 1600, height: 900 } })

function titleOf(name: string): string {
  return XPCS.meta.variables[name].title
}

test('submitting with no variable shows a validation error and keeps the dialog open', async ({
  page,
}) => {
  await openProposal(page)
  const dialog = await openPlotDialog(page)

  await submitPlot(dialog)

  await expect(dialog.getByText('Please enter a valid variable')).toBeVisible()
  await expect(dialog).toBeVisible()
})

test('choosing a Y variable plots a summary against Run', async ({ page }) => {
  await openProposal(page)
  const dialog = await openPlotDialog(page)

  // X defaults to Run, so choosing only Y plots the variable against the run.
  await chooseVariable(dialog, { label: 'Y-axis', title: titleOf('n_trains') })
  await submitPlot(dialog)

  await expect(
    plotTab(page, `Summary: ${titleOf('n_trains')} vs. Run`)
  ).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('plotting data for a custom run set opens a data plot for those runs', async ({
  page,
}) => {
  await openProposal(page)
  const dialog = await openPlotDialog(page)

  // Switching to "Plot data" reveals the Variable combobox and the custom-runs
  // input; the dialog is the only path to plotting an arbitrary run set.
  await dialog.getByText('Plot data').click()
  await chooseVariable(dialog, {
    label: 'Variable',
    title: titleOf('xgm_intensity'),
  })
  await dialog.getByPlaceholder('e.g. 1,2,3,6-20,22').fill('7,9')
  await submitPlot(dialog)

  const tab = plotTab(page, `Data: ${titleOf('xgm_intensity')}`)
  await expect(tab).toBeVisible()
  await expect(tab).toContainText('run 7-9')
  await expect(plotFigure(page)).toBeVisible()
})
