import { previewRunFields } from '@damnit-frontend/shared/mocks'
import { test, expect } from '#fixtures'
import { WIDE_VIEWPORT } from '#support/grid'
import { openProposal, titleOf } from '#support/table'
import {
  chooseVariable,
  openPlotDialog,
  plotFigure,
  plotEntry,
  submitPlot,
} from '#support/plots'

test.use({ viewport: WIDE_VIEWPORT })

test('submitting with no variable shows a validation error and keeps the dialog open', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const dialog = await openPlotDialog(page)

  await submitPlot(dialog)

  await expect(
    dialog.getByText('Choose a variable', { exact: true })
  ).toBeVisible()
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
  await chooseVariable(dialog, {
    label: 'Y axis',
    title: titleOf(example, 'n_trains'),
  })
  await submitPlot(dialog)

  await expect(
    plotEntry(page, `${titleOf(example, 'n_trains')} vs. Run`)
  ).toBeVisible()
  await expect(plotFigure(page)).toBeVisible()
})

test('plotting a preview for runs "7,9" fetches only runs 7 and 9, not the range', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  const dialog = await openPlotDialog(page)

  // A preview inlines its runs into the document, so read them back from it.
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

  // Preview swaps the axes for one Variable field and asks for runs; the
  // dialog is the only path to an arbitrary run set.
  await dialog.getByText('Preview', { exact: true }).click()
  await chooseVariable(dialog, {
    label: 'Variable',
    title: titleOf(example, 'xgm_intensity'),
  })
  await dialog.getByRole('textbox', { name: 'Runs' }).fill('7,9')
  await submitPlot(dialog)

  const entry = plotEntry(page, titleOf(example, 'xgm_intensity'))
  await expect(entry).toBeVisible()
  await expect(entry).toContainText('2 runs, 7-9')
  await expect(plotFigure(page)).toBeVisible()
  expect([...new Set(requestedRuns)].sort((a, b) => a - b)).toEqual([7, 9])
})
