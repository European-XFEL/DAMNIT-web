import { previewRunFields } from '@damnit-frontend/shared/mocks'
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
  example,
}) => {
  await openProposal(page, example)
  const dialog = await openPlotDialog(page)

  await submitPlot(dialog)

  await expect(dialog.getByText('Please enter a valid variable')).toBeVisible()
  await expect(dialog).toBeVisible()
  // The submit was blocked, not just flagged: no figure was plotted.
  await expect(plotFigure(page)).toHaveCount(0)
})

test('choosing a Y variable plots a summary against Run', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const dialog = await openPlotDialog(page)

  // X defaults to Run, so choosing only Y plots the variable against the run.
  await chooseVariable(dialog, { label: 'Y-axis', title: titleOf('n_trains') })
  await submitPlot(dialog)

  await expect(
    plotTab(page, `Summary: ${titleOf('n_trains')} vs. Run`)
  ).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('plotting a preview for a custom run set opens a preview plot for those runs', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const dialog = await openPlotDialog(page)

  // The "run 7-9" subtitle only shows first-last, so collect the runs actually
  // fetched: the comma input is a discrete set, so exactly runs 7 and 9 should
  // be asked for, not the range 7..9. A preview inlines its runs into the
  // document rather than passing them as variables, so read them back from it.
  const requestedRuns: number[] = []
  page.on('request', (request) => {
    if (!request.url().includes('/graphql')) {
      return
    }
    const { operationName, query } = (request.postDataJSON() ?? {}) as {
      operationName?: string
      query?: string
    }
    if (operationName === 'PreviewDataQuery' && query) {
      requestedRuns.push(...previewRunFields(query).map((field) => field.run))
    }
  })

  // Switching to "Plot preview" reveals the Variable combobox and the
  // custom-runs input; the dialog is the only path to an arbitrary run set.
  await dialog.getByText('Plot preview').click()
  await chooseVariable(dialog, {
    label: 'Variable',
    title: titleOf('xgm_intensity'),
  })
  await dialog.getByPlaceholder('e.g. 1,2,3,6-20,22').fill('7,9')
  await submitPlot(dialog)

  const tab = plotTab(page, `Preview: ${titleOf('xgm_intensity')}`)
  await expect(tab).toBeVisible()
  await expect(tab).toContainText('run 7-9')
  await expect(plotFigure(page)).toBeVisible()
  expect([...new Set(requestedRuns)].sort((a, b) => a - b)).toEqual([7, 9])
})
