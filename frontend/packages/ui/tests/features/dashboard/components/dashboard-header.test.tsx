import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import DashboardHeader from '#src/features/dashboard/components/dashboard-header'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import { viewSelected } from '#src/features/dashboard/stores/dashboard.slice'
import { addPlot } from '#src/features/plots/plots.slice'
import { renderWithProviders } from '#tests/support/render'
import { resizeViewport } from '#tests/support/viewport'

// The real identity, so the row is the one the app draws.
function renderHeader(store: AppStore) {
  return renderWithProviders(
    <Provider store={store}>
      <MemoryRouter>
        <DashboardHeader
          identity={
            <ProposalIdentity
              instrument="MID"
              label="p6996"
              detail="Christian Gutt"
            />
          }
          homeTo="/home"
        />
      </MemoryRouter>
    </Provider>
  )
}

test('the last crumb names the view on show', async () => {
  // The group a view sits in only shows from the `sm` breakpoint up.
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  const screen = await renderHeader(store)

  // The table, after the Table group it sits in
  await expect
    .element(screen.getByText('All runs'))
    .toHaveAttribute('aria-current', 'page')
  await expect
    .element(screen.getByText('Table'))
    .not.toHaveAttribute('aria-current')

  // The context file, which has no group
  store.dispatch(viewSelected({ kind: 'context-file' }))
  await expect
    .element(screen.getByText('Context file'))
    .toHaveAttribute('aria-current', 'page')

  // A plot, after the Plots group it sits in
  store.dispatch(
    addPlot({
      variables: ['run', 'n_trains'],
      runs: ['1', '2', '3'],
      source: 'summary',
      name: 'Trains vs. Run',
    })
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
  const screen = await renderHeader(store)

  await expect
    .element(screen.getByText('Pulses vs. Run'))
    .toHaveTextContent('Pulses vs. Run, summary plot (All runs)')
})

test('the row drops the group a view sits in below `sm`', async () => {
  const store = setupStore()
  const screen = await renderHeader(store)

  await expect
    .element(screen.getByText('All runs'))
    .toHaveAttribute('aria-current', 'page')
  await expect.element(screen.getByText('Table')).not.toBeInTheDocument()
})

test('the toggle folds the nav to the rail and back', async () => {
  // The toggle only shows from the `sm` breakpoint up.
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  const screen = await renderHeader(store)

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

test('clicking the proposal returns to the table', async () => {
  const store = setupStore()
  store.dispatch(viewSelected({ kind: 'context-file' }))
  const screen = await renderHeader(store)

  await screen.getByRole('button', { name: /p6996/ }).click()

  await expect
    .element(screen.getByText('All runs'))
    .toHaveAttribute('aria-current', 'page')
})
