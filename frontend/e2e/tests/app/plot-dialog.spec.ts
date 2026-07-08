import { test, expect } from '#fixtures'

import { openProposal, titleOf } from '#support/table'
import {
  chooseVariable,
  openPlotDialog,
  PLOT_VIEWPORT,
  plotFigure,
  plotTab,
  submitPlot,
} from '#support/plots'

test.use({ viewport: PLOT_VIEWPORT })

test('submitting with no variable shows a validation error and keeps the dialog open', async ({
  page,
}) => {
  await openProposal(page)
  const dialog = await openPlotDialog(page)

  await submitPlot(dialog)

  await expect(dialog.getByText('Please enter a valid variable')).toBeVisible()
  await expect(dialog).toBeVisible()
  // The submit was blocked, not just flagged: no figure was plotted.
  await expect(plotFigure(page)).toHaveCount(0)
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

  // The "run 7-9" subtitle only shows first-last, so collect the runs actually
  // fetched: the comma input is a discrete set, so exactly runs 7 and 9 should
  // fire an ExtractedDataQuery, not the range 7..9.
  const requestedRuns: number[] = []
  page.on('request', (request) => {
    if (!request.url().includes('/graphql')) {
      return
    }
    const { operationName, variables } = (request.postDataJSON() ?? {}) as {
      operationName?: string
      variables?: { run?: number }
    }
    if (operationName === 'ExtractedDataQuery') {
      requestedRuns.push(variables?.run as number)
    }
  })

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
  expect([...new Set(requestedRuns)].sort((a, b) => a - b)).toEqual([7, 9])
})
