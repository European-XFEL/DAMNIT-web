import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import LiveUpdatesItem from '#src/features/dashboard/components/status/live-updates-item'
import {
  liveUpdates,
  type LiveUpdatesStopReason,
} from '#src/graphql/live-updates'
import { renderWithProviders } from '#tests/support/render'

const openStoppedBubble = async (reason: LiveUpdatesStopReason) => {
  liveUpdates({
    status: 'stopped',
    since: new Date(2026, 9, 20, 3, 0, 14).getTime(),
    reason,
  })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const stopped = screen.getByRole('button', {
    name: /^Live updates stopped/,
  })
  ;(stopped.element() as HTMLElement).focus()

  return screen
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

test('live updates that are still connecting show nothing for their first second', async () => {
  liveUpdates({ status: 'connecting', since: Date.now() })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const connecting = screen.getByRole('img', {
    name: 'Connecting to live updates...',
  })

  // Just short of a second
  await vi.advanceTimersByTimeAsync(999)
  expect(connecting.query()).toBeNull()

  // At a second
  await vi.advanceTimersByTimeAsync(1)
  await expect.element(connecting).toBeVisible()
})

test('the live item keeps keyboard focus when a reconnect turns it live', async () => {
  liveUpdates({ status: 'reconnecting', since: Date.now() })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const lost = screen.getByRole('button', { name: /^Lost live updates/ })
  ;(lost.element() as HTMLElement).focus()

  liveUpdates({ status: 'live', since: Date.now() })

  await expect
    .element(screen.getByRole('img', { name: 'Live updates.' }))
    .toHaveFocus()
})

test('the live item keeps keyboard focus when live updates drop', async () => {
  liveUpdates({ status: 'live', since: Date.now() })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const live = screen.getByRole('img', { name: 'Live updates.' })
  ;(live.element() as HTMLElement).focus()

  // The socket closes
  liveUpdates({ status: 'connecting', since: Date.now() })
  await expect
    .element(screen.getByRole('img', { name: 'Connecting to live updates...' }))
    .toHaveFocus()

  // graphql-ws starts its wait before the next try
  liveUpdates({ status: 'reconnecting', since: Date.now() })
  await expect
    .element(screen.getByRole('button', { name: /^Lost live updates/ }))
    .toHaveFocus()
})

test('the lost bubble shows a try under way once it has run a second', async () => {
  liveUpdates({ status: 'reconnecting', since: Date.now() })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const lost = screen.getByRole('button', { name: /^Lost live updates/ })
  const bubble = screen.getByRole('dialog')
  const tryNow = screen.getByRole('button', { name: 'Try now', exact: true })
  ;(lost.element() as HTMLElement).focus()

  // Waiting to try again
  await expect.element(bubble).toHaveTextContent('Trying again within 30 s.')
  await expect.element(tryNow).not.toHaveAttribute('aria-disabled')

  // A try runs a second
  liveUpdates({ status: 'reconnecting', since: Date.now(), trying: true })
  await vi.advanceTimersByTimeAsync(1000)
  await expect.element(bubble).toHaveTextContent('Trying again now.')
  await expect.element(tryNow).toHaveAttribute('aria-disabled', 'true')
})

test('each try waits its own second before the lost bubble shows it', async () => {
  liveUpdates({ status: 'reconnecting', since: Date.now() })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const lost = screen.getByRole('button', { name: /^Lost live updates/ })
  const bubble = screen.getByRole('dialog')
  const tryNow = screen.getByRole('button', { name: 'Try now', exact: true })
  ;(lost.element() as HTMLElement).focus()

  // A try that fails half a second in
  liveUpdates({ status: 'reconnecting', since: Date.now(), trying: true })
  await vi.advanceTimersByTimeAsync(500)
  await expect.element(bubble).toHaveTextContent('Trying again within 30 s.')
  liveUpdates({ status: 'reconnecting', since: Date.now() })
  // Lets the failure render: React would batch it with the next try, which
  // in the app comes a wait or a press later.
  await vi.advanceTimersByTimeAsync(0)

  // The next try, just short of its own second
  liveUpdates({ status: 'reconnecting', since: Date.now(), trying: true })
  await vi.advanceTimersByTimeAsync(999)
  await expect.element(bubble).toHaveTextContent('Trying again within 30 s.')
  await expect.element(tryNow).not.toHaveAttribute('aria-disabled')

  // At its own second
  await vi.advanceTimersByTimeAsync(1)
  await expect.element(bubble).toHaveTextContent('Trying again now.')
})

test('every time in the live tooltip carries its date', async () => {
  const wentLive = new Date(2026, 9, 17, 9, 0, 5).getTime()
  liveUpdates({ status: 'live', since: wentLive })
  const screen = await renderWithProviders(<LiveUpdatesItem />)
  const tooltip = screen.getByRole('tooltip')
  const live = screen.getByRole('img', { name: 'Live updates.' })
  ;(live.element() as HTMLElement).focus()

  // Live, with no update yet
  await expect
    .element(tooltip)
    .toHaveTextContent(
      'Live updates. No changes since 17 October 2026 at 09:00:05.'
    )

  // An update arrives
  liveUpdates({
    status: 'live',
    since: wentLive,
    lastPushAt: new Date(2026, 9, 17, 18, 42, 10).getTime(),
  })
  await expect
    .element(tooltip)
    .toHaveTextContent('Live updates. Last update 17 October 2026 at 18:42:10.')

  // The connection drops overnight, and the bubble takes the tooltip's place
  liveUpdates({
    status: 'reconnecting',
    since: new Date(2026, 9, 19, 23, 58, 10).getTime(),
  })
  await expect
    .element(screen.getByRole('dialog'))
    .toHaveTextContent('Lost live updates 19 October 2026 at 23:58:10.')
})

test('the stopped bubble says when live updates stopped and that the login has ended', async () => {
  const screen = await openStoppedBubble('login')

  await expect
    .element(screen.getByRole('dialog'))
    .toHaveTextContent(
      'Live updates stopped 20 October 2026 at 03:00:14. Your login has ended.'
    )
})

test('the stopped bubble blames the server for any end but the login', async () => {
  const screen = await openStoppedBubble('server')

  await expect
    .element(screen.getByRole('dialog'))
    .toHaveTextContent(
      'Live updates stopped 20 October 2026 at 03:00:14. The server ended them.'
    )
})

// The e2e spec presses it: Chromium will not let a test stub the reload.
test('the stopped bubble holds a Reload button', async () => {
  const screen = await openStoppedBubble('server')

  await expect
    .element(screen.getByRole('button', { name: 'Reload', exact: true }))
    .toBeVisible()
})
