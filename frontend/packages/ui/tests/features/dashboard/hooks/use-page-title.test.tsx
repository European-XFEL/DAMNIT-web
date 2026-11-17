import { expect, test } from 'vitest'

import { setupStore } from '#src/app/store/store'
import { usePageTitle } from '#src/features/dashboard/hooks/use-page-title'
import { addPlot } from '#src/features/plots/plots.slice'
import { renderInDashboard } from '#tests/support/dashboard-router'

function PageTitle() {
  usePageTitle('p6996')

  return null
}

test('the page title names the proposal, then the view on show, and goes back to the one before when the dashboard goes', async () => {
  document.title = 'DAMNIT'
  const store = setupStore()
  store.dispatch(
    addPlot({
      variables: ['run', 'n_pulses'],
      source: 'summary',
      name: 'Pulses vs. Run',
    })
  )
  const { screen, router } = await renderInDashboard(<PageTitle />, {
    store,
    url: '/proposal/6996/plots/summary?x=run&y=n_pulses',
  })

  // A plot, with its runs
  await expect
    .poll(() => document.title)
    .toBe('p6996: Pulses vs. Run (All runs)')

  // The table, without the group it sits in
  await router.navigate('/proposal/6996/table')
  await expect.poll(() => document.title).toBe('p6996: All runs')

  // Leaving the dashboard
  await screen.unmount()
  expect(document.title).toBe('DAMNIT')
})
