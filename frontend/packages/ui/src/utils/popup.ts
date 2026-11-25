import type { MouseEvent } from 'react'
import { randomId } from '@mantine/hooks'

const POPUP_SIZE = 'width=960,height=640'

// The name outlasts a reload and the opener's closing, where Chromium's
// `menubar.visible` does not. A tab, or a window another page named, lacks it.
const POPUP_NAME_PREFIX = 'popup:'

// Size features with no toolbar make the browser open a popup, not a tab, and a
// window named by its address takes the next click on the same link.
export function openPopup(event: MouseEvent<HTMLAnchorElement>) {
  if (!isPlainClick(event)) {
    return
  }

  const { href } = event.currentTarget

  // No address finds the plot's open popup without reloading it, so it keeps
  // its zoom. A blocked popup leaves the click to the link, which opens a tab.
  const popup = window.open('', `${POPUP_NAME_PREFIX}${href}`, POPUP_SIZE)
  if (popup === null) {
    return
  }

  event.preventDefault()
  if (popup.location.href !== href) {
    popup.location.href = href
  }
}

export function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  const modified =
    event.ctrlKey || event.metaKey || event.shiftKey || event.altKey

  return event.button === 0 && !modified
}

export function isPopup() {
  return window.name.startsWith(POPUP_NAME_PREFIX)
}

// A popup opens this name to bring the dashboard forward.
export function nameDashboardWindow() {
  if (window.name === '' || isPopup()) {
    window.name = randomId('dashboard:')
  }
}
