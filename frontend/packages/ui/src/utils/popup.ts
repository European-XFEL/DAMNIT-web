import type { MouseEvent } from 'react'

const POPUP_SIZE = 'width=960,height=640'

// Size features with no toolbar make the browser open a popup, not a tab, and a
// window named by its address takes the next click on the same link.
export function openPopup(event: MouseEvent<HTMLAnchorElement>) {
  const modified =
    event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
  if (event.button !== 0 || modified) {
    return
  }

  const { href } = event.currentTarget
  // A popup that turned into the dashboard keeps its name, which would make
  // its own link reload it rather than open a window.
  const name = window.name === href ? '_blank' : href

  // No address finds the plot's open popup without reloading it, so it keeps
  // its zoom. A blocked popup leaves the click to the link, which opens a tab.
  const popup = window.open('', name, POPUP_SIZE)
  if (popup === null) {
    return
  }

  event.preventDefault()
  if (popup.location.href !== href) {
    popup.location.href = href
  }
}
