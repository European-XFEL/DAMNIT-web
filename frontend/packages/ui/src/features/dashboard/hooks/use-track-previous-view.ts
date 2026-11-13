import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

import { useAppDispatch, useAppStore } from '#src/app/store/hooks'
import { useOpenView } from '#src/features/dashboard/hooks/use-open-view'
import {
  mobileNavClosed,
  viewLeft,
  type PreviousView,
} from '#src/features/dashboard/stores/dashboard.slice'
import type { View } from '#src/features/dashboard/types/dashboard.types'
import { removePlot } from '#src/features/plots/plots.slice'

// Records the view each move leaves, so closing a plot can go back to it. A
// closed plot's entry goes only once the move lands, as Back can cut it short.
export function useTrackPreviousView() {
  const dispatch = useAppDispatch()
  const store = useAppStore()
  const { key, pathname, search, state } = useLocation()

  // Back or Forward onto the move replays its state, but closes nothing.
  const closedPlot: string | undefined =
    useNavigationType() === 'PUSH' ? state?.closedPlot : undefined
  const view = useOpenView()
  const kind = view?.kind
  const plotId = view?.kind === 'plot' ? view.id : undefined
  const shown = useRef<PreviousView & { kind: View['kind'] }>()

  useEffect(() => {
    const url = pathname + search
    const left = shown.current

    // A plot the nav does not list drew only an alert, so a close never goes
    // back to it.
    const leftOpen =
      left?.kind !== 'plot' ||
      (left.plotId !== undefined && left.plotId in store.getState().plots.data)

    // A plot has more than one address, such as its keys in another order.
    const moved = (left?.plotId ?? left?.url) !== (plotId ?? url)

    if (left !== undefined && leftOpen && moved) {
      dispatch(viewLeft({ url: left.url, plotId: left.plotId }))
    }

    // After `viewLeft`, so the slice forgets a closed plot left just now.
    if (closedPlot !== undefined) {
      dispatch(removePlot(closedPlot))
    } else {
      // Below `sm` the nav covers the view, so any move but a close shuts it.
      dispatch(mobileNavClosed())
    }

    // A link to no view drew only a message, so a close never goes back to it.
    shown.current = kind === undefined ? undefined : { url, plotId, kind }
  }, [key, pathname, search, kind, plotId, closedPlot, store, dispatch])
}
