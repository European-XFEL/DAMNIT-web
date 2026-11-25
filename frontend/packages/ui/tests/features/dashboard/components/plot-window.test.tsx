import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { setupStore } from '#src/app/store/store'
import PlotWindow from '#src/features/dashboard/components/plot-window'
import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import { useIsPlotWindow } from '#src/features/dashboard/hooks/use-is-plot-window'
import { liveUpdates } from '#src/graphql/live-updates'
import { currentUrl, renderInDashboard } from '#tests/support/dashboard-router'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

const POPUP_URL = '/proposal/6996/plots/summary?x=run&y=n_pulses&window'
const DASHBOARD_URL = '/proposal/6996/plots/summary?x=run&y=n_pulses'

// Named as `openPopup` names it, with an opener that never answers by default.
function stubPopup({
  opener = { closed: false, postMessage: vi.fn() },
}: { opener?: unknown } = {}) {
  vi.stubGlobal('name', `popup:${POPUP_URL}`)
  vi.stubGlobal('opener', opener)
  vi.stubGlobal('close', vi.fn())
}

test('in a popup, Open in dashboard sends the plot to the opener, raises it by its name once it answers, and closes', async () => {
  // The window stands in for its own opener, so it gets the message and answers.
  stubPopup({ opener: window })
  const open = vi.spyOn(window, 'open').mockReturnValue(window)
  const sent: unknown[] = []
  const answer = (event: MessageEvent) => {
    const { type, id, to } = event.data ?? {}
    if (type === 'open-view') {
      window.postMessage({ type: 'view-accepted', id }, window.location.origin)
    } else if (type === 'show-view') {
      sent.push(to)
      window.postMessage({ type: 'view-shown', id }, window.location.origin)
    }
  }
  window.addEventListener('message', answer)
  onTestFinished(() => window.removeEventListener('message', answer))
  const { screen, router } = await renderWindow(POPUP_URL)

  await screen.getByRole('link', { name: 'Open in dashboard' }).click()

  await vi.waitFor(() => expect(window.close).toHaveBeenCalled())
  expect(sent).toEqual([
    { pathname: '/proposal/6996/plots/summary', search: '?x=run&y=n_pulses' },
  ])
  expect(open).toHaveBeenCalledExactlyOnceWith('', `popup:${POPUP_URL}`)
  expect(open).toHaveBeenCalledBefore(vi.mocked(window.close))
  expect(currentUrl(router)).toBe(POPUP_URL)
})

test('in a popup with no answer, Open in dashboard opens the dashboard in a new tab and closes', async () => {
  stubPopup()
  const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
  const { screen, router } = await renderWindow(POPUP_URL)

  await screen.getByRole('link', { name: 'Open in dashboard' }).click()

  await vi.waitFor(() => expect(window.close).toHaveBeenCalled(), {
    timeout: 2000,
  })
  expect(open).toHaveBeenCalledWith(DASHBOARD_URL, '_blank')
  expect(currentUrl(router)).toBe(POPUP_URL)
})

test('in a popup whose opener accepts after the wait, Open in dashboard opens a new tab and never tells the opener to show the plot', async () => {
  stubPopup({ opener: window })
  const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
  const seen: string[] = []
  const acceptLate = (event: MessageEvent) => {
    const { type, id } = event.data ?? {}
    seen.push(type)
    if (type === 'open-view') {
      setTimeout(
        () =>
          window.postMessage(
            { type: 'view-accepted', id },
            window.location.origin
          ),
        700
      )
    }
  }
  window.addEventListener('message', acceptLate)
  onTestFinished(() => window.removeEventListener('message', acceptLate))
  const { screen } = await renderWindow(POPUP_URL)

  // The wait ends before the acceptance, so the popup opens a tab
  await screen.getByRole('link', { name: 'Open in dashboard' }).click()

  await vi.waitFor(() => expect(window.close).toHaveBeenCalled(), {
    timeout: 2000,
  })
  expect(open).toHaveBeenCalledWith(DASHBOARD_URL, '_blank')

  // The late acceptance arrives; a go would land before the marker behind it.
  await vi.waitFor(() => expect(seen).toContain('view-accepted'))
  window.postMessage({ type: 'marker' }, window.location.origin)
  await vi.waitFor(() => expect(seen).toContain('marker'))
  expect(seen).toEqual(['open-view', 'view-accepted', 'marker'])
})

test('in a popup whose new tab is blocked, Open in dashboard turns the popup into the dashboard', async () => {
  stubPopup()
  vi.spyOn(window, 'open').mockReturnValue(null)
  const { screen, router } = await renderWindow(POPUP_URL)

  await screen.getByRole('link', { name: 'Open in dashboard' }).click()

  await vi.waitFor(() => expect(currentUrl(router)).toBe(DASHBOARD_URL), {
    timeout: 2000,
  })
  expect(window.close).not.toHaveBeenCalled()
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
