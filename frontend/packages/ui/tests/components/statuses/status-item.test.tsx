import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import StatusItem from '#src/components/statuses/status-item'
import { renderWithProviders } from '#tests/support/render'

test('an item with an action runs it on Enter and on Space', async () => {
  const onClick = vi.fn()
  const screen = await renderWithProviders(
    <StatusItem tooltip="Try now" label="Lost" onClick={onClick} />
  )
  const item = screen.getByRole('button', { name: 'Lost' })
  ;(item.element() as HTMLElement).focus()

  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard(' ')

  expect(onClick).toHaveBeenCalledTimes(2)
})

test('an item with an action runs it once while Space is held', async () => {
  const onClick = vi.fn()
  const screen = await renderWithProviders(
    <StatusItem tooltip="Try now" label="Lost" onClick={onClick} />
  )
  const item = screen.getByRole('button', { name: 'Lost' })
  ;(item.element() as HTMLElement).focus()

  await userEvent.keyboard('[Space>5]')

  expect(onClick).toHaveBeenCalledTimes(1)
})
