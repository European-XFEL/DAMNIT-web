import { expect, test } from 'vitest'

import { setupStore } from '#src/app/store/store'
import PlotWindow from '#src/features/dashboard/components/plot-window'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import { useIsPlotWindow } from '#src/features/dashboard/hooks/use-is-plot-window'
import { liveUpdates } from '#src/graphql/live-updates'
import { currentUrl, renderInDashboard } from '#tests/support/dashboard-router'

function renderWindow(url: string) {
  return renderInDashboard(
    <PlotWindow
      main="The plot"
      identity={<ProposalIdentity instrument="MID" label="p6996" />}
      heading="p6996"
      homeTo="/home"
      loading={false}
      pending={false}
    />,
    { store: setupStore(), url }
  )
}

function WindowFlag() {
  return useIsPlotWindow() ? 'window' : 'dashboard'
}

test('a plot window draws the plot with live updates and no nav, and links back to the dashboard', async () => {
  liveUpdates({ status: 'live', since: Date.now() })
  const { screen, router } = await renderWindow(
    '/proposal/6996/plots/summary?x=run&y=n_pulses&runs=1-3,5&window'
  )

  // The window on open
  await expect.element(screen.getByText('The plot')).toBeVisible()
  await expect
    .element(screen.getByRole('img', { name: 'Live updates.' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('navigation', { name: 'Dashboard' }))
    .not.toBeInTheDocument()

  // Back to the dashboard
  await screen.getByRole('link', { name: 'Open in dashboard' }).click()

  expect(currentUrl(router)).toBe(
    '/proposal/6996/plots/summary?x=run&y=n_pulses&runs=1-3,5'
  )
})

test('only a plot opens alone in a window', async () => {
  const { screen, router } = await renderInDashboard(<WindowFlag />, {
    store: setupStore(),
    url: '/proposal/6996/plots/summary?x=run&y=n_pulses&window',
  })

  // A plot with the flag
  await expect.element(screen.getByText('window')).toBeVisible()

  // The table ignores the flag
  await router.navigate('/proposal/6996/table?window')
  await expect.element(screen.getByText('dashboard')).toBeVisible()

  // A plot without it
  await router.navigate('/proposal/6996/plots/summary?x=run&y=n_pulses')
  await expect.element(screen.getByText('dashboard')).toBeVisible()
})
