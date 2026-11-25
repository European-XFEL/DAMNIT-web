import { randomId } from '@mantine/hooks'

import {
  parsePlotAddress,
  withoutWindowFlag,
} from '#src/features/plots/plot-address'

// The router's own parts, without the app's basename, so the browser router and
// the demo's hash router read them alike.
export type ViewAddress = { pathname: string; search: string }

const OPEN_VIEW = 'open-view'
const VIEW_ACCEPTED = 'view-accepted'
const SHOW_VIEW = 'show-view'
const VIEW_SHOWN = 'view-shown'

// Answers took about 10 ms and at most 300 ms in Chromium and Firefox. The tab
// opened after the wait still counts as coming from the click.
const OPENER_ANSWER_WAIT = 500

// Resolves true once the opener shows the view, and never if it fails to. The
// opener moves only on the popup's go, so a late acceptance shows nothing twice.
export function askOpenerToShow(to: ViewAddress) {
  const opener: Window | null = window.opener
  if (opener === null || opener.closed) {
    return Promise.resolve(false)
  }

  const id = randomId()
  const send = (type: string) =>
    opener.postMessage({ type, id, to }, window.location.origin)

  return new Promise<boolean>((resolve) => {
    const finish = (shown: boolean) => {
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(shown)
    }
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== opener ||
        event.origin !== window.location.origin ||
        event.data?.id !== id
      ) {
        return
      }

      if (event.data.type === VIEW_ACCEPTED) {
        clearTimeout(timeout)
        send(SHOW_VIEW)
      } else if (event.data.type === VIEW_SHOWN) {
        finish(true)
      }
    }

    const timeout = setTimeout(() => finish(false), OPENER_ANSWER_WAIT)
    window.addEventListener('message', onMessage)
    send(OPEN_VIEW)
  })
}

// Chrome brings a window forward when a click opens its name, not on `focus()`.
// Firefox does neither and flashes its taskbar entry.
export function raiseOpener() {
  const opener: Window | null = window.opener
  if (opener?.name) {
    window.open('', opener.name)
  }
}

// Undefined for any other message, which the caller leaves unanswered, so no
// page can send the dashboard elsewhere.
export function readPlotRequest(event: MessageEvent, plotsPath: string) {
  if (event.origin !== window.location.origin) {
    return
  }

  const message: {
    type?: unknown
    id?: unknown
    to?: { pathname?: unknown; search?: unknown }
  } = event.data ?? {}
  const { type, id } = message
  if (type !== OPEN_VIEW && type !== SHOW_VIEW) {
    return
  }

  const pathname = message.to?.pathname
  const search = message.to?.search
  const prefix = `${plotsPath}/`
  if (
    typeof id !== 'string' ||
    typeof pathname !== 'string' ||
    typeof search !== 'string' ||
    !pathname.startsWith(prefix)
  ) {
    return
  }

  const kind = pathname.slice(prefix.length)
  if ('error' in parsePlotAddress(kind, new URLSearchParams(search))) {
    return
  }

  return {
    id,
    to: { pathname, search: withoutWindowFlag(search) },
    step: type === OPEN_VIEW ? 'ask' : 'show',
  }
}

export function acceptPlotRequest(
  source: MessageEventSource | null,
  id: string
) {
  source?.postMessage(
    { type: VIEW_ACCEPTED, id },
    { targetOrigin: window.location.origin }
  )
}

export function reportPlotShown(source: MessageEventSource | null, id: string) {
  source?.postMessage(
    { type: VIEW_SHOWN, id },
    { targetOrigin: window.location.origin }
  )
}
