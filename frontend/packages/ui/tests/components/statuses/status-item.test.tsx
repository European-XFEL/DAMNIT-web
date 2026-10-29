import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { IconBroadcast, IconBroadcastOff } from '@tabler/icons-react'

import StatusItem from '#src/components/statuses/status-item'
import { renderWithProviders } from '#tests/support/render'

const CLOSE_DELAY = 200

const TRY_NOW = { label: 'Try now', icon: null, onClick: () => {} }

const lostItem = ({ onClick = TRY_NOW.onClick } = {}) => (
  <StatusItem
    tooltip="Lost live updates."
    aria-label="Lost"
    icon={<IconBroadcastOff aria-hidden />}
    action={{ ...TRY_NOW, onClick }}
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

const renderLostItem = (options?: { onClick: () => void }) =>
  renderWithPointerOff(lostItem(options))

type Screen = Awaited<ReturnType<typeof renderWithPointerOff>>

const lostItemButton = (screen: Screen) =>
  screen.getByRole('button', { name: 'Lost Try now' })

const tryNowButton = (screen: Screen) =>
  screen.getByRole('button', { name: 'Try now', exact: true })

// Well past the delay and the bubble's 150 ms fade, since a fading button
// still counts as visible and a busy runner fires timers late.
const waitPastCloseDelay = () =>
  new Promise((resolve) => setTimeout(resolve, CLOSE_DELAY * 3))

const nextFrame = () => new Promise(requestAnimationFrame)

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

  test('focus coming back into the bubble as it fades keeps it open', async () => {
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

    // Tab on and straight back, inside the fade
    await userEvent.keyboard('{Tab}{Shift>}{Tab}{/Shift}')
    await waitPastCloseDelay()

    await expect.element(button).toHaveFocus()
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

  test("focus on the bubble's words moves to the item when the action goes", async () => {
    const screen = await renderLostItem()
    await userEvent.hover(lostItemButton(screen))
    await userEvent.click(screen.getByText('Lost live updates.'))
    await expect.element(screen.getByRole('dialog')).toHaveFocus()

    // A try works
    screen.rerender(liveItem)

    await expect
      .element(screen.getByRole('img', { name: 'Live' }))
      .toHaveFocus()
  })

  test('a bubble that left with its action stays shut when the action comes back', async () => {
    const screen = await renderLostItem()
    const button = tryNowButton(screen)

    // A try works while the pointer rests on the bubble
    await userEvent.hover(lostItemButton(screen))
    await userEvent.hover(button)
    screen.rerender(liveItem)
    await expect.element(button).not.toBeInTheDocument()

    // Live updates drop again a while later, with the pointer elsewhere
    await userEvent.unhover(button)
    await waitPastCloseDelay()
    screen.rerender(lostItem())
    await nextFrame()
    await expect.element(button).not.toBeInTheDocument()
  })
})

describe('following along with a screen reader', () => {
  test("an item with an action is described by its bubble's words only while the bubble is open", async () => {
    const screen = await renderLostItem()
    const item = lostItemButton(screen)
    await expect.element(item).not.toHaveAttribute('aria-describedby')

    await userEvent.hover(item)

    await expect.element(tryNowButton(screen)).toBeVisible()
    await expect.element(item).toHaveAccessibleDescription('Lost live updates.')
  })

  test('an item with no action is described by its tooltip while it shows', async () => {
    const screen = await renderWithPointerOff(liveItem)

    await userEvent.tab()

    await expect
      .element(screen.getByRole('img', { name: 'Live' }))
      .toHaveAccessibleDescription('Live updates.')
  })
})
