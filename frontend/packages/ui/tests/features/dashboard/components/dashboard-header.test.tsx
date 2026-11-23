import { expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import DashboardHeader from '#src/features/dashboard/components/dashboard-header'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import { renderInDashboard } from '#tests/support/dashboard-router'
import { resizeViewport } from '#tests/support/viewport'

// The real identity, so the row is the one the app draws.
async function renderHeader(store: AppStore, { url }: { url?: string } = {}) {
  return renderInDashboard(
    <DashboardHeader
      identity={
        <ProposalIdentity
          instrument="MID"
          label="p6996"
          detail="Christian Gutt"
        />
      }
      homeTo="/home"
    />,
    { store, url }
  )
}

test('the toggle folds the nav to the rail and back', async () => {
  // The toggle only shows from the `sm` breakpoint up.
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  const { screen } = await renderHeader(store)

  // Collapse
  await screen.getByRole('button', { name: 'Collapse navigation' }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Expand navigation' }))
    .toBeVisible()

  // Expand
  await screen.getByRole('button', { name: 'Expand navigation' }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Collapse navigation' }))
    .toBeVisible()
})
