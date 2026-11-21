import { expect, test } from 'vitest'

import { setupStore } from '#src/app/store/store'
import PageTitle from '#src/features/dashboard/components/page-title'
import { addPlot } from '#src/features/plots/plots.slice'
import { renderInDashboard } from '#tests/support/dashboard-router'

test('the page title names the proposal, then the view on show', async () => {
  const store = setupStore()
  store.dispatch(
    addPlot({
      variables: ['run', 'n_pulses'],
      source: 'summary',
      name: 'Pulses vs. Run',
    })
  )
  const { router } = await renderInDashboard(<PageTitle heading="p6996" />, {
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
})

test('the page title goes back to the one before when the dashboard goes', async () => {
  document.title = 'DAMNIT'
  const { screen } = await renderInDashboard(<PageTitle heading="p6996" />, {
    store: setupStore(),
  })
  await expect.poll(() => document.title).toBe('p6996: All runs')

  await screen.unmount()

  expect(document.title).toBe('DAMNIT')
})
