import { expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import DashboardHeader from '#src/features/dashboard/components/dashboard-header'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import { addPlot } from '#src/features/plots/plots.slice'
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

test('Open in new window shows only beside a plot the crumbs name, and not on a phone', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(
    addPlot({
      variables: ['run', 'n_trains'],
      runs: ['1', '2', '3'],
      source: 'summary',
      name: 'Trains vs. Run',
    })
  )
  const { screen, router } = await renderHeader(store, {
    url: '/proposal/6996/plots/summary?x=run&y=n_trains&runs=1-3',
  })
  const openInNewWindow = screen.getByRole('link', {
    name: 'Open in new window',
  })

  // A plot on show
  await expect
    .element(openInNewWindow)
    .toHaveAttribute(
      'href',
      '/proposal/6996/plots/summary?x=run&y=n_trains&runs=1-3&window'
    )
  await expect.element(openInNewWindow).toHaveAttribute('target', '_blank')

  // A link to a plot that was never drawn, whose crumbs end at the group
  await router.navigate('/proposal/6996/plots/summary?x=run&y=n_pulses')
  await expect
    .element(screen.getByText('Plots'))
    .toHaveAttribute('aria-current', 'page')
  await expect.element(openInNewWindow).not.toBeInTheDocument()

  // The table
  await router.navigate('/proposal/6996/table')
  await expect
    .element(screen.getByText('All runs'))
    .toHaveAttribute('aria-current', 'page')
  await expect.element(openInNewWindow).not.toBeInTheDocument()

  // The plot again by a link in another order, which gets the same popup
  await router.navigate(
    '/proposal/6996/plots/summary?y=n_trains&runs=1,2,3&x=run'
  )
  await expect
    .element(openInNewWindow)
    .toHaveAttribute(
      'href',
      '/proposal/6996/plots/summary?x=run&y=n_trains&runs=1-3&window'
    )

  // On a phone
  await resizeViewport({ width: 414, height: 896 })
  await expect.element(openInNewWindow).not.toBeInTheDocument()
})

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
