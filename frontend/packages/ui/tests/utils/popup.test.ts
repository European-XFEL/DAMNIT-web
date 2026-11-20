import type { MouseEvent } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { nameDashboardWindow, openPopup } from '#src/utils/popup'

const PLOT_HREF =
  'http://localhost/proposal/6996/plots/summary?x=run&y=n_pulses&window'
const POPUP_NAME = `popup:${PLOT_HREF}`
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
    popupAt: 'about:blank',
    navigations: [PLOT_HREF],
    preventDefaultCalls: 1,
  },
  {
    name: 'the open popup of that plot, left as it is',
    popupAt: PLOT_HREF,
    navigations: [],
    preventDefaultCalls: 1,
  },
  {
    name: 'a tab when the popup is blocked',
    popupAt: null,
    navigations: [],
    preventDefaultCalls: 0,
  },
])(
  'a click on a plot link opens $name',
  ({ popupAt, navigations, preventDefaultCalls }) => {
    const { popup, navigations: sent } = fakePopup(popupAt)
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { open })

    const event = clickLink()

    expect(open).toHaveBeenCalledWith('', POPUP_NAME, POPUP_SIZE)
    expect(sent).toEqual(navigations)
    expect(event.preventDefault).toHaveBeenCalledTimes(preventDefaultCalls)
  }
)

test.each([
  { name: 'a middle-click', keys: { button: 1 } },
  { name: 'a Ctrl-click', keys: { ctrlKey: true } },
])('$name on a plot link is left to the browser', ({ keys }) => {
  const open = vi.fn()
  vi.stubGlobal('window', { open })

  const event = clickLink(keys)

  expect(open).not.toHaveBeenCalled()
  expect(event.preventDefault).not.toHaveBeenCalled()
})

test.each([
  {
    name: 'an unnamed dashboard names its window, so a popup can raise it',
    before: '',
    after: /^dashboard:[a-z0-9]+$/,
  },
  {
    name: 'a popup turned into the dashboard drops its popup name, so its own new window for the plot opens apart',
    before: 'popup:/proposal/6996/plots/summary?x=run&y=n_pulses&window',
    after: /^dashboard:[a-z0-9]+$/,
  },
  {
    name: 'a dashboard keeps a window name another page gave it',
    before: 'results',
    after: /^results$/,
  },
])('$name', ({ before, after }) => {
  vi.stubGlobal('window', { name: before })

  nameDashboardWindow()

  expect(window.name).toMatch(after)
})
