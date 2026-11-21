import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { setupStore } from '#src/app/store/store'
import ContextMenu from '#src/features/table/components/context-menu'
import { renderInDashboard } from '#tests/support/dashboard-router'

const WINDOW_LINK = '/proposal/6996/plots/summary?x=run&y=n_pulses&window'
const PLOT_HREF = new URL(WINDOW_LINK, window.location.href).href

afterEach(() => {
  vi.restoreAllMocks()
})

function renderMenu(onOutsideClick: () => void) {
  return renderInDashboard(
    <ContextMenu
      isOpen
      position={{ x: 20, y: 20 }}
      contents={[
        {
          key: 'plot',
          kind: 'summary',
          title: 'Plot: summary',
          subtitle: 'Pulses vs. Run',
          onClick: () => {},
          windowLink: WINDOW_LINK,
        },
      ]}
      onOutsideClick={onOutsideClick}
    />,
    { store: setupStore() }
  )
}

// Where the click goes is `openPopup`'s, tested in `tests/utils/popup.test.ts`.
test('the new-window button opens its plot in a popup and closes the menu', async () => {
  const popup = { location: { href: PLOT_HREF } } as Window
  vi.spyOn(window, 'open').mockReturnValue(popup)
  const onOutsideClick = vi.fn()
  const { screen } = await renderMenu(onOutsideClick)

  // Caught on its way down, since the button stops it on its way back up.
  let click: Event | undefined
  window.addEventListener('click', (event) => (click = event), {
    capture: true,
    once: true,
  })
  const button = screen.getByRole('link', { name: 'Open in new window' })
  await expect.element(button).toHaveAttribute('href', WINDOW_LINK)
  await expect.element(button).toHaveAttribute('target', '_blank')

  // Follow the link
  await button.click()

  expect(click?.defaultPrevented).toBe(true)
  expect(onOutsideClick).toHaveBeenCalled()
})

test('a middle-click on the new-window button closes the menu', async () => {
  const onOutsideClick = vi.fn()
  const { screen } = await renderMenu(onOutsideClick)
  const button = screen.getByRole('link', { name: 'Open in new window' })

  // Canceled on its way down, so the middle-click opens no tab.
  const blockNewTab = (event: Event) => event.preventDefault()
  window.addEventListener('auxclick', blockNewTab, { capture: true })
  onTestFinished(() =>
    window.removeEventListener('auxclick', blockNewTab, { capture: true })
  )

  await button.click({ button: 'middle' })

  expect(onOutsideClick).toHaveBeenCalledOnce()
})
