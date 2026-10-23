// Guards the @mantine/core patch in frontend/patches/README.md: without it, a
// popover reopened as its fade starts leaves the page anyway.
import { useState } from 'react'
import { expect, test } from 'vitest'
import { Popover } from '@mantine/core'

import { renderWithProviders } from '#tests/support/render'

function PopoverWithToggles() {
  const [opened, setOpened] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpened(false)}>
        Close
      </button>
      <button type="button" onClick={() => setOpened(true)}>
        Open
      </button>
      <Popover opened={opened} withinPortal={false}>
        <Popover.Target>
          <span>Target</span>
        </Popover.Target>
        <Popover.Dropdown>
          <button type="button">Inside</button>
        </Popover.Dropdown>
      </Popover>
    </>
  )
}

const nextFrame = () => new Promise(requestAnimationFrame)

// Well past the 150 ms fade, since a busy runner fires timers late.
const waitPastFade = () => new Promise((resolve) => setTimeout(resolve, 600))

test('a popover reopened as its fade starts keeps focus inside it', async () => {
  const screen = await renderWithProviders(<PopoverWithToggles />)
  const close = screen
    .getByRole('button', { name: 'Close' })
    .element() as HTMLElement
  const open = screen
    .getByRole('button', { name: 'Open' })
    .element() as HTMLElement
  const inside = screen.getByRole('button', { name: 'Inside' })

  // A close alone ends the fade within the wait. query() takes one look, where
  // expect.element would keep polling past the wait.
  await expect.element(inside).toBeVisible()
  close.click()
  await waitPastFade()
  expect(inside.query()).toBeNull()

  // Reopen, and focus the dropdown once its fade ends
  open.click()
  await waitPastFade()
  inside.element().focus()
  await expect.element(inside).toHaveFocus()

  // Close, then reopen before the fade's first frame runs. Plain DOM clicks
  // keep the reopen inside the frame that nextFrame waits for.
  close.click()
  await nextFrame()
  open.click()
  await waitPastFade()

  await expect.element(inside).toHaveFocus()
})
