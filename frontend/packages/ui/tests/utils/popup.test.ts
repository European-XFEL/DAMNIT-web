import type { MouseEvent } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { openPopup } from '#src/utils/popup'

const PLOT_HREF =
  'http://localhost/proposal/6996/plots/summary?x=run&y=n_pulses&window'
const POPUP_SIZE = 'width=960,height=640'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakePopup(address: string | null) {
  const navigations: string[] = []
  if (address === null) {
    return { popup: null, navigations }
  }

  const location = {
    get href() {
      return address
    },
    set href(to: string) {
      navigations.push(to)
    },
  }

  return { popup: { location }, navigations }
}

function clickLink(keys: { button?: number; ctrlKey?: boolean } = {}) {
  const event = {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...keys,
    currentTarget: { href: PLOT_HREF },
    preventDefault: vi.fn(),
  }
  openPopup(event as unknown as MouseEvent<HTMLAnchorElement>)

  return event
}

test.each([
  {
    name: 'a new popup, sent to the plot',
    windowName: '',
    popupAt: 'about:blank',
    target: PLOT_HREF,
    navigations: [PLOT_HREF],
    preventDefaultCalls: 1,
  },
  {
    name: 'the open popup of that plot, left as it is',
    windowName: '',
    popupAt: PLOT_HREF,
    target: PLOT_HREF,
    navigations: [],
    preventDefaultCalls: 1,
  },
  {
    name: 'a tab when the popup is blocked',
    windowName: '',
    popupAt: null,
    target: PLOT_HREF,
    navigations: [],
    preventDefaultCalls: 0,
  },
  {
    name: 'another popup from the window that holds the plot name',
    windowName: PLOT_HREF,
    popupAt: 'about:blank',
    target: '_blank',
    navigations: [PLOT_HREF],
    preventDefaultCalls: 1,
  },
])(
  'a click on a plot link opens $name',
  ({ windowName, popupAt, target, navigations, preventDefaultCalls }) => {
    const { popup, navigations: sent } = fakePopup(popupAt)
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { name: windowName, open })

    const event = clickLink()

    expect(open).toHaveBeenCalledWith('', target, POPUP_SIZE)
    expect(sent).toEqual(navigations)
    expect(event.preventDefault).toHaveBeenCalledTimes(preventDefaultCalls)
  }
)

test.each([
  { name: 'a middle-click', keys: { button: 1 } },
  { name: 'a Ctrl-click', keys: { ctrlKey: true } },
])('$name on a plot link is left to the browser', ({ keys }) => {
  const open = vi.fn()
  vi.stubGlobal('window', { name: '', open })

  const event = clickLink(keys)

  expect(open).not.toHaveBeenCalled()
  expect(event.preventDefault).not.toHaveBeenCalled()
})
