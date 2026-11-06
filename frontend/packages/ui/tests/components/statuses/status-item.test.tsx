import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { IconBroadcast, IconBroadcastOff } from '@tabler/icons-react'

import StatusItem from '#src/components/statuses/status-item'
import { LOADER_DELAY } from '#src/hooks/use-shown-after'
import { renderWithProviders } from '#tests/support/render'

const BUBBLE_DELAY = 200

afterEach(() => {
  vi.useRealTimers()
})

const TRY_NOW = { label: 'Try now', icon: null, onClick: () => {} }

const lostItem = ({ onClick = TRY_NOW.onClick, busy = false } = {}) => (
  <StatusItem
    tooltip="Lost live updates."
    aria-label="Lost"
    icon={<IconBroadcastOff aria-hidden />}
    action={{ ...TRY_NOW, onClick, busy }}
  />
)

const liveItem = (
  <StatusItem
    tooltip="Live updates."
    aria-label="Live"
    icon={<IconBroadcast aria-hidden />}
  />
)

// An earlier test can leave the pointer resting where the item draws.
const renderWithPointerOff = async (ui: ReactNode) => {
  const screen = await renderWithProviders(ui)
  await userEvent.unhover(screen.container)
  return screen
}

const renderLostItem = (options?: Parameters<typeof lostItem>[0]) =>
  renderWithPointerOff(lostItem(options))

type Screen = Awaited<ReturnType<typeof renderWithPointerOff>>

const lostItemButton = (screen: Screen) =>
  screen.getByRole('button', { name: 'Lost Try now' })

const tryNowButton = (screen: Screen) =>
  screen.getByRole('button', { name: 'Try now', exact: true })

// Well past the delay, since a busy runner fires timers late.
const waitPastCloseDelay = () =>
  new Promise((resolve) => setTimeout(resolve, BUBBLE_DELAY * 3))

describe('pressing the item', () => {
  test('a click on an item with an action runs it', async () => {
    const onClick = vi.fn()
    const screen = await renderLostItem({ onClick })

    await userEvent.click(lostItemButton(screen))

    expect(onClick).toHaveBeenCalledOnce()
  })

  test('an item with an action runs it on Enter and on Space', async () => {
    const onClick = vi.fn()
    const screen = await renderLostItem({ onClick })
    ;(lostItemButton(screen).element() as HTMLElement).focus()

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  test('an item with an action runs it once while Space is held', async () => {
    const onClick = vi.fn()
    const screen = await renderLostItem({ onClick })
    ;(lostItemButton(screen).element() as HTMLElement).focus()

    await userEvent.keyboard('[Space>5]')

    expect(onClick).toHaveBeenCalledOnce()
  })

  test('an action pressed from the bubble only runs from its button, not from the item', async () => {
    const onClick = vi.fn()
    const screen = await renderWithPointerOff(
      <StatusItem
        tooltip="Live updates stopped."
        aria-label="Stopped"
        icon={<IconBroadcastOff aria-hidden />}
        action={{ label: 'Reload', icon: null, onClick, bubbleOnly: true }}
      />
    )
    const reloadButton = screen.getByRole('button', {
      name: 'Reload',
      exact: true,
    })

    // Click the item, then press Enter and Space on it
    await userEvent.click(screen.getByRole('button', { name: 'Stopped' }))
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    await expect.element(reloadButton).toBeVisible()
    expect(onClick).not.toHaveBeenCalled()

    // Click Reload
    await userEvent.click(reloadButton)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('opening the bubble', () => {
  test('an item with an action opens its bubble on hover', async () => {
    const screen = await renderLostItem()

    await userEvent.hover(lostItemButton(screen))

    await expect.element(tryNowButton(screen)).toBeVisible()
  })

  test('an item with words only opens its bubble a moment after hover', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const screen = await renderWithPointerOff(liveItem)
    const bubble = screen.getByRole('tooltip')

    await userEvent.hover(screen.getByRole('img', { name: 'Live' }))

    // Just before the delay
    await vi.advanceTimersByTimeAsync(BUBBLE_DELAY - 1)
    expect(bubble.query()).toBeNull()

    // At the delay
    await vi.advanceTimersByTimeAsync(1)
    await expect.element(bubble).toHaveTextContent('Live updates.')
  })

  test('an item with an action opens its bubble on keyboard focus', async () => {
    const screen = await renderLostItem()

    await userEvent.tab()

    await expect.element(tryNowButton(screen)).toBeVisible()
  })

  test('a tap on an item with an action opens its bubble', async () => {
    const screen = await renderLostItem()

    // A tap clicks with no hover first
    ;(lostItemButton(screen).element() as HTMLElement).click()

    await expect.element(tryNowButton(screen)).toBeVisible()
  })

  test('an item clicked open and shut stays shut when focus comes back to it', async () => {
    const screen = await renderLostItem()
    const item = lostItemButton(screen)
    const button = tryNowButton(screen)

    // Click it open, then move away
    await userEvent.click(item)
    await expect.element(button).toBeVisible()
    await userEvent.unhover(item)
    await expect.element(button).not.toBeInTheDocument()

    // Focus leaves and comes back, as it does with the window
    ;(item.element() as HTMLElement).blur()
    ;(item.element() as HTMLElement).focus()
    await waitPastCloseDelay()
    await expect.element(button).not.toBeInTheDocument()
  })
})

describe('leaving the item', () => {
  test('the bubble stays open as the pointer moves onto it', async () => {
    const screen = await renderLostItem()
    const button = tryNowButton(screen)

    // Hover the item
    await userEvent.hover(lostItemButton(screen))
    await expect.element(button).toBeVisible()

    // Move onto the bubble and stay past the close delay
    await userEvent.hover(button)
    await waitPastCloseDelay()
    await expect.element(button).toBeVisible()
  })

  test('the bubble closes once the pointer leaves', async () => {
    const screen = await renderLostItem()
    const item = lostItemButton(screen)
    const button = tryNowButton(screen)
    await userEvent.hover(item)
    await expect.element(button).toBeVisible()

    await userEvent.unhover(item)

    await expect.element(button).not.toBeInTheDocument()
  })

  test('keyboard focus on the item holds the bubble open as the pointer leaves', async () => {
    const screen = await renderLostItem()
    const item = lostItemButton(screen)
    const button = tryNowButton(screen)
    await userEvent.tab()
    await expect.element(button).toBeVisible()

    // The pointer passes over the item and on
    await userEvent.hover(item)
    await userEvent.unhover(item)
    await waitPastCloseDelay()

    await expect.element(button).toBeVisible()
  })

  test('focus on the button holds the bubble open as the pointer leaves', async () => {
    const screen = await renderLostItem()
    const button = tryNowButton(screen)
    await userEvent.hover(lostItemButton(screen))
    await userEvent.click(button)

    await userEvent.unhover(button)
    await waitPastCloseDelay()

    await expect.element(button).toBeVisible()
  })
})

describe('tabbing into the bubble', () => {
  test("focus moves from the item to the bubble's button", async () => {
    const screen = await renderLostItem()
    const button = tryNowButton(screen)
    await userEvent.tab()
    await expect.element(button).toBeVisible()

    await userEvent.tab()

    await expect.element(button).toHaveFocus()
  })

  test('tabbing past the bubble closes it, and tabbing back opens it on the item', async () => {
    const screen = await renderWithPointerOff(
      <>
        {lostItem()}
        <button type="button">Next</button>
      </>
    )
    const button = tryNowButton(screen)
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(button).toHaveFocus()

    // Tab on to the next button
    await userEvent.tab()
    await expect.element(button).not.toBeInTheDocument()

    // Tab back
    await userEvent.tab({ shift: true })
    await expect.element(lostItemButton(screen)).toHaveFocus()
    await expect.element(button).toBeVisible()
  })
})

describe('pressing Escape', () => {
  test('the bubble closes and focus in it moves back to the item', async () => {
    const screen = await renderLostItem()
    const button = tryNowButton(screen)
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(button).toHaveFocus()

    await userEvent.keyboard('{Escape}')

    await expect.element(lostItemButton(screen)).toHaveFocus()
    await expect.element(button).not.toBeInTheDocument()
  })

  test('the bubble closes even when the focused element keeps the key', async () => {
    const screen = await renderWithPointerOff(
      <>
        {lostItem()}
        {/* As Glide's hidden input does */}
        <input
          aria-label="Grid"
          onKeyDown={(event) => event.stopPropagation()}
        />
      </>
    )
    const button = tryNowButton(screen)
    await userEvent.hover(lostItemButton(screen))
    await expect.element(button).toBeVisible()
    ;(
      screen.getByRole('textbox', { name: 'Grid' }).element() as HTMLElement
    ).focus()

    await userEvent.keyboard('{Escape}')

    await expect.element(button).not.toBeInTheDocument()
  })

  test('the run panel keeps its run on the Escape that closes the bubble', async () => {
    const onPanelEscape = vi.fn()
    const screen = await renderWithPointerOff(
      <>
        {lostItem()}
        {/* As the run panel does */}
        <input
          aria-label="Panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
              onPanelEscape()
            }
          }}
        />
      </>
    )
    const button = tryNowButton(screen)
    await userEvent.hover(lostItemButton(screen))
    await expect.element(button).toBeVisible()
    ;(
      screen.getByRole('textbox', { name: 'Panel' }).element() as HTMLElement
    ).focus()

    // The first Escape closes the bubble
    await userEvent.keyboard('{Escape}')
    await expect.element(button).not.toBeInTheDocument()
    expect(onPanelEscape).not.toHaveBeenCalled()

    // The next one is the panel's
    await userEvent.keyboard('{Escape}')
    expect(onPanelEscape).toHaveBeenCalledOnce()
  })
})

describe('retrying', () => {
  test('holding Enter on the button runs the action once', async () => {
    const onClick = vi.fn()
    const screen = await renderLostItem({ onClick })
    const button = tryNowButton(screen)
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(button).toHaveFocus()

    await userEvent.keyboard('{Enter>5/}')

    expect(onClick).toHaveBeenCalledOnce()
  })

  test('a busy button ignores presses before its loader shows', async () => {
    const onClick = vi.fn()
    const screen = await renderLostItem({ onClick })
    const button = tryNowButton(screen)
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(button).toHaveFocus()

    // A press while ready
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()

    // A press as soon as it is busy
    screen.rerender(lostItem({ onClick, busy: true }))
    await userEvent.keyboard('{Enter}')
    expect(button.element()).not.toHaveAttribute('aria-disabled')
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('a tap on a busy item opens its bubble and presses nothing', async () => {
    const onClick = vi.fn()
    const screen = await renderLostItem({ onClick, busy: true })

    // A tap clicks with no hover first
    ;(lostItemButton(screen).element() as HTMLElement).click()

    await expect.element(tryNowButton(screen)).toBeVisible()
    expect(onClick).not.toHaveBeenCalled()
  })

  test('a busy item says it is unavailable a second in, until the work ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const screen = await renderLostItem({ busy: true })
    const item = lostItemButton(screen)

    // Just before the delay
    await vi.advanceTimersByTimeAsync(LOADER_DELAY - 1)
    expect(item.element()).not.toHaveAttribute('aria-disabled')

    // At the delay
    await vi.advanceTimersByTimeAsync(1)
    await expect.element(item).toHaveAttribute('aria-disabled', 'true')

    // The work has ended
    screen.rerender(lostItem({ busy: false }))
    await expect.element(item).not.toHaveAttribute('aria-disabled')
  })

  test('a double click does not press the action its first click brought in', async () => {
    const reload = vi.fn()
    const stoppedItem = (
      <StatusItem
        tooltip="Live updates stopped."
        aria-label="Stopped"
        icon={<IconBroadcastOff aria-hidden />}
        action={{ label: 'Reload', icon: null, onClick: reload }}
      />
    )
    const screen = await renderLostItem({
      // The retry finds the login has ended, and live updates stop
      onClick: () => screen.rerender(stoppedItem),
    })
    await userEvent.hover(lostItemButton(screen))
    const reloadButton = screen.getByRole('button', {
      name: 'Reload',
      exact: true,
    })

    // Double-click Try now
    await userEvent.dblClick(tryNowButton(screen))
    await expect.element(reloadButton).toBeVisible()
    expect(reload).not.toHaveBeenCalled()

    // Click Reload
    await userEvent.click(reloadButton)
    expect(reload).toHaveBeenCalledOnce()
  })

  test('focus on the button moves to the item when the action goes', async () => {
    const screen = await renderLostItem()
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(tryNowButton(screen)).toHaveFocus()

    // A try works
    screen.rerender(liveItem)

    await expect
      .element(screen.getByRole('img', { name: 'Live' }))
      .toHaveFocus()
  })

  test("focus on the bubble's words stays when the action goes", async () => {
    const screen = await renderLostItem()
    await userEvent.hover(lostItemButton(screen))
    await userEvent.click(screen.getByText('Lost live updates.'))
    await expect.element(screen.getByRole('dialog')).toHaveFocus()

    // A try works
    screen.rerender(liveItem)

    await expect.element(screen.getByRole('tooltip')).toHaveFocus()
  })

  test('an open bubble stays open as its button comes and goes', async () => {
    const screen = await renderLostItem()
    const button = tryNowButton(screen)
    await userEvent.hover(lostItemButton(screen))
    await userEvent.hover(button)

    // A try works while the pointer rests on the bubble
    screen.rerender(liveItem)
    await expect
      .element(screen.getByRole('tooltip'))
      .toHaveTextContent('Live updates.')

    // Live updates drop again
    screen.rerender(lostItem())
    await expect.element(tryNowButton(screen)).toBeVisible()
  })
})

describe('following along with a screen reader', () => {
  test("an item is described by its bubble's words only while the bubble is open", async () => {
    const screen = await renderWithPointerOff(liveItem)
    const item = screen.getByRole('img', { name: 'Live' })
    await expect.element(item).not.toHaveAttribute('aria-describedby')

    // Open it
    await userEvent.tab()
    await expect.element(item).toHaveAccessibleDescription('Live updates.')

    // Close it
    await userEvent.keyboard('{Escape}')
    await expect.element(item).not.toHaveAttribute('aria-describedby')
  })

  test('a bubble with no button is a tooltip, and one with a button a dialog named by its words', async () => {
    const screen = await renderWithPointerOff(
      <>
        {liveItem}
        {lostItem()}
      </>
    )

    // Tab to the live item
    await userEvent.tab()
    await expect
      .element(screen.getByRole('tooltip'))
      .toHaveTextContent('Live updates.')

    // Tab to the lost item
    await userEvent.tab()
    await expect
      .element(screen.getByRole('dialog'))
      .toHaveAccessibleName('Lost live updates.')
  })
})
