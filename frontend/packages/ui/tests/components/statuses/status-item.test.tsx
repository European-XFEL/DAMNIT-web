import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { IconBroadcastOff } from '@tabler/icons-react'

import StatusItem from '#src/components/statuses/status-item'
import { renderWithProviders } from '#tests/support/render'

const TRY_NOW = { label: 'Try now', icon: null, onClick: () => {} }

const lostItem = ({ onClick = TRY_NOW.onClick } = {}) => (
  <StatusItem
    tooltip="Lost live updates."
    aria-label="Lost"
    icon={<IconBroadcastOff aria-hidden />}
    action={{ ...TRY_NOW, onClick }}
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
})
