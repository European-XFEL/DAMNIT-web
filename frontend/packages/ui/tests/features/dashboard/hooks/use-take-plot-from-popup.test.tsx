import { useLocation } from 'react-router'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { setupStore } from '#src/app/store/store'
import { usePageTitle } from '#src/features/dashboard/hooks/use-page-title'
import { useTakePlotFromPopup } from '#src/features/dashboard/hooks/use-take-plot-from-popup'
import { currentUrl, renderInDashboard } from '#tests/support/dashboard-router'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Listener() {
  const takenWhileHidden = useTakePlotFromPopup()
  usePageTitle('p6996: Table', { marked: takenWhileHidden })
  const { search } = useLocation()

  return (
    <>
      <p>The dashboard</p>
      <p>Showing {search}</p>
    </>
  )
}

const PLOT = {
  pathname: '/proposal/6996/plots/summary',
  search: '?x=run&y=n_pulses',
}

const PLOT_URL = '/proposal/6996/plots/summary?x=run&y=n_pulses'

const PULSES_PLOT = {
  pathname: '/proposal/6996/plots/summary',
  search: '?x=run&y=pulses',
}

const PULSES_PLOT_URL = '/proposal/6996/plots/summary?x=run&y=pulses'

// A test cannot hide its own tab, so the tab says it is hidden.
function stubVisibility(state: DocumentVisibilityState) {
  return vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
}

async function renderDashboard() {
  const answers: unknown[] = []
  const recordAnswer = (event: MessageEvent) => {
    if (['view-accepted', 'view-shown'].includes(event.data?.type)) {
      answers.push(event.data)
    }
  }
  window.addEventListener('message', recordAnswer)
  onTestFinished(() => window.removeEventListener('message', recordAnswer))

  const { screen, router } = await renderInDashboard(<Listener />, {
    store: setupStore(),
  })
  await expect.element(screen.getByText('The dashboard')).toBeVisible()

  // Every address the dashboard showed, since a later move hides an earlier one.
  const shown: string[] = []
  router.subscribe(() => {
    const url = currentUrl(router)
    if (shown.at(-1) !== url) {
      shown.push(url)
    }
  })

  return { screen, router, answers, shown }
}

// Messages a window posts to itself arrive in order, so every answer queued
// before this marker has arrived once it does.
function receiveQueuedMessages() {
  return new Promise<void>((resolve) => {
    const onMarker = (event: MessageEvent) => {
      if (event.data === 'marker') {
        window.removeEventListener('message', onMarker)
        resolve()
      }
    }
    window.addEventListener('message', onMarker)
    window.postMessage('marker', window.location.origin)
  })
}

// Dispatched by hand, since a posted message always carries the page's own
// origin. The window stands in for the popup, so the answer comes back to it.
function sendFromPopup(
  type: 'open-view' | 'show-view',
  to: unknown,
  { id = 'p1', origin = window.location.origin } = {}
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type, id, to },
      origin,
      source: window,
    })
  )
}

test("a popup's plot of this proposal is accepted, shown on the popup's go, and reported shown", async () => {
  const { router, answers } = await renderDashboard()

  // The popup asks
  window.postMessage(
    { type: 'open-view', id: 'p1', to: PLOT },
    window.location.origin
  )

  await vi.waitFor(() =>
    expect(answers).toEqual([{ type: 'view-accepted', id: 'p1' }])
  )
  expect(currentUrl(router)).toBe('/proposal/6996/table')

  // The popup says go
  window.postMessage(
    { type: 'show-view', id: 'p1', to: PLOT },
    window.location.origin
  )

  await vi.waitFor(() => expect(currentUrl(router)).toBe(PLOT_URL))
  await vi.waitFor(() =>
    expect(answers).toEqual([
      { type: 'view-accepted', id: 'p1' },
      { type: 'view-shown', id: 'p1' },
    ])
  )
  expect(document.title).toBe('p6996: Table')
})

test('a plot the dashboard moves away from before it draws is never reported shown, so its popup stays open', async () => {
  const { router, answers } = await renderDashboard()

  sendFromPopup('show-view', PLOT)
  void router.navigate('/proposal/6996/context-file')
  await receiveQueuedMessages()

  // A later plot proves the dashboard still reports the ones it shows.
  sendFromPopup('show-view', PLOT, { id: 'p2' })
  await vi.waitFor(() =>
    expect(answers).toEqual([{ type: 'view-shown', id: 'p2' }])
  )
  expect(currentUrl(router)).toBe(PLOT_URL)
})

test('a plot taken while the tab is hidden marks the title until the tab is on show', async () => {
  const { router } = await renderDashboard()
  const visibility = stubVisibility('hidden')

  // A plot comes in while the tab is hidden
  sendFromPopup('show-view', PLOT)

  await vi.waitFor(() => expect(currentUrl(router)).toBe(PLOT_URL))
  await vi.waitFor(() => expect(document.title).toBe('● p6996: Table'))

  // The tab comes on show
  visibility.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))

  await vi.waitFor(() => expect(document.title).toBe('p6996: Table'))
})

test('a tab on show again before the mark is drawn drops it', async () => {
  const { screen } = await renderDashboard()

  // Hidden when the plot comes in, on show by the time the mark would draw.
  stubVisibility('visible').mockReturnValueOnce('hidden')

  sendFromPopup('show-view', PLOT)

  // The plot on show means the render that set the mark has run.
  await expect
    .element(screen.getByText('Showing ?x=run&y=n_pulses'))
    .toBeVisible()
  await vi.waitFor(() => expect(document.title).toBe('p6996: Table'))
})

test.each([
  {
    name: 'a plot of another proposal',
    to: { ...PLOT, pathname: '/proposal/1234/plots/summary' },
    origin: window.location.origin,
  },
  {
    name: 'a plot from another site',
    to: PLOT,
    origin: 'https://example.org',
  },
  {
    name: 'an address that names no plot',
    to: { pathname: '/proposal/6996/plots/summary', search: '?x=run' },
    origin: window.location.origin,
  },
])(
  '$name leaves the dashboard as it is and gets no answer',
  async ({ to, origin }) => {
    const { router, answers, shown } = await renderDashboard()

    sendFromPopup('open-view', to, { origin })
    sendFromPopup('show-view', to, { origin })
    await receiveQueuedMessages()

    // A good request after it proves the listener ran, and only it gets answers.
    sendFromPopup('show-view', PULSES_PLOT, { id: 'p2' })
    await vi.waitFor(() =>
      expect(answers).toEqual([{ type: 'view-shown', id: 'p2' }])
    )
    expect(currentUrl(router)).toBe(PULSES_PLOT_URL)
    expect(shown).toEqual([PULSES_PLOT_URL])
  }
)
