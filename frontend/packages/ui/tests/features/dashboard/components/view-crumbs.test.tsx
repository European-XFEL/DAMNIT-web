import { expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import ViewCrumbs from '#src/features/dashboard/components/view-crumbs'
import { addPlot } from '#src/features/plots/plots.slice'
import { currentUrl, renderInDashboard } from '#tests/support/dashboard-router'
import { resizeViewport } from '#tests/support/viewport'

// The real identity, so the row is the one the app draws.
async function renderCrumbs(store: AppStore, { url }: { url?: string } = {}) {
  return renderInDashboard(
    <ViewCrumbs
      identity={
        <ProposalIdentity
          instrument="MID"
          label="p6996"
          detail="Christian Gutt"
        />
      }
    />,
    { store, url }
  )
}

test('the last crumb names the view on show', async () => {
  // The group a view sits in only shows from the `sm` breakpoint up.
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
  const { screen, router } = await renderCrumbs(store)

  // The table, after the Table group it sits in
  await expect
    .element(screen.getByText('All runs'))
    .toHaveAttribute('aria-current', 'page')
  await expect
    .element(screen.getByText('Table'))
    .not.toHaveAttribute('aria-current')

  // The context file, which has no group
  await router.navigate('/proposal/6996/context-file')
  await expect
    .element(screen.getByText('Context file'))
    .toHaveAttribute('aria-current', 'page')

  // A plot, after the Plots group it sits in
  await router.navigate(
    '/proposal/6996/plots/summary?x=run&y=n_trains&runs=1-3'
  )
  const plotCrumb = screen.getByText('Trains vs. Run')
  await expect.element(plotCrumb).toHaveAttribute('aria-current', 'page')
  await expect
    .element(plotCrumb)
    .toHaveTextContent('Trains vs. Run, summary plot (Runs 1-3)')
  await expect
    .element(screen.getByText('Plots'))
    .not.toHaveAttribute('aria-current')
})

test('a plot that follows every run says all runs in its crumb', async () => {
  const store = setupStore()
  store.dispatch(
    addPlot({
      variables: ['run', 'n_pulses'],
      source: 'summary',
      name: 'Pulses vs. Run',
    })
  )
  const { screen } = await renderCrumbs(store, {
    url: '/proposal/6996/plots/summary?x=run&y=n_pulses',
  })

  await expect
    .element(screen.getByText('Pulses vs. Run'))
    .toHaveTextContent('Pulses vs. Run, summary plot (All runs)')
})

test('the row drops the group a view sits in below `sm`', async () => {
  const store = setupStore()
  const { screen } = await renderCrumbs(store)

  await expect
    .element(screen.getByText('All runs'))
    .toHaveAttribute('aria-current', 'page')
  await expect.element(screen.getByText('Table')).not.toBeInTheDocument()
})

test('the proposal links to All runs', async () => {
  const store = setupStore()
  const { screen, router } = await renderCrumbs(store, {
    url: '/proposal/6996/context-file',
  })

  await screen.getByRole('link', { name: /p6996/ }).click()

  expect(currentUrl(router)).toBe('/proposal/6996/table')
})
