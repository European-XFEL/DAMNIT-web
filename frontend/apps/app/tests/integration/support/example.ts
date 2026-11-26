import type { Page } from '@playwright/test'

import { columnIndex } from '@damnit-frontend/testing/playwright/grid'
import {
  chooseVariable,
  openPlotDialog,
  submitPlot,
  waitForPlotView,
} from '@damnit-frontend/testing/playwright/plots'
import { openDashboard } from '@damnit-frontend/testing/playwright/table'
import {
  accessibleProposals,
  type Example,
} from '#tests/integration/examples/xpcs'

export async function openProposal(page: Page, example: Example) {
  // A proposal the example's user cannot access makes the dashboard silently
  // show the not-found page, so fail loudly in the specs that open one.
  const proposal = example.proposalMetadata[0].number
  if (!accessibleProposals(example).includes(proposal)) {
    throw new Error(
      `proposalMetadata[0] (${proposal}) is not accessible to this example's ` +
        `user; update its userInfo or proposalMetadata so openProposal lands ` +
        `on an accessible proposal`
    )
  }

  await openDashboard(page, () => page.goto(`proposal/${proposal}`))
}

export function columnOf(example: Example, name: string): number {
  return columnIndex(Object.keys(example.meta.variables), name)
}

export function titleOf(example: Example, name: string): string {
  return example.meta.variables[name].title
}

export function lastVariableOf(example: Example): string {
  const names = Object.keys(example.meta.variables)
  return names[names.length - 1]
}

// The dialog's X axis already defaults to Run.
export async function plotVariable(
  page: Page,
  { example, variable }: { example: Example; variable: string }
) {
  const dialog = await openPlotDialog(page)
  await chooseVariable(dialog, {
    label: 'Y axis',
    title: titleOf(example, variable),
  })
  await submitPlot(dialog)
  await waitForPlotView(page)
}
