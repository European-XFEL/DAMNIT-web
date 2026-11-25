import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useResolvedPath } from 'react-router'

import {
  acceptPlotRequest,
  readPlotRequest,
  reportPlotShown,
  type ViewAddress,
} from '#src/features/dashboard/utils/opener-messages'
import { nameDashboardWindow } from '#src/utils/popup'

// Through the router, so the nav's plot list and the table's state stay.
// Returns whether a plot came in while the tab was hidden, until it is on show.
export function useTakePlotFromPopup() {
  const navigate = useNavigate()
  const location = useLocation()
  const plotsPath = useResolvedPath('plots').pathname
  const taken = useRef<{
    id: string
    to: ViewAddress
    source: MessageEventSource | null
  }>(undefined)
  const [takenWhileHidden, setTakenWhileHidden] = useState(false)

  useEffect(() => {
    nameDashboardWindow()

    const onMessage = (event: MessageEvent) => {
      const request = readPlotRequest(event, plotsPath)
      if (request === undefined) {
        return
      }

      const { id, to, step } = request
      if (step === 'ask') {
        acceptPlotRequest(event.source, id)
        return
      }

      // A second plot replaces the first, whose popup then stays open.
      taken.current = { id, to, source: event.source }
      void navigate(to)
      if (document.visibilityState === 'hidden') {
        setTakenWhileHidden(true)
      }
    }

    window.addEventListener('message', onMessage)

    return () => window.removeEventListener('message', onMessage)
  }, [navigate, plotsPath])

  // A canceled navigation resolves too, so only the address says the plot is
  // on show. A view that fails to load unmounts the dashboard before this runs.
  useEffect(() => {
    const plot = taken.current
    if (
      plot === undefined ||
      location.pathname !== plot.to.pathname ||
      location.search !== plot.to.search
    ) {
      return
    }

    taken.current = undefined
    reportPlotShown(plot.source, plot.id)
  }, [location])

  useEffect(() => {
    if (!takenWhileHidden) {
      return
    }

    const clearOnShow = () => {
      if (document.visibilityState === 'visible') {
        setTakenWhileHidden(false)
      }
    }

    // The tab can come forward before this effect runs, when Chrome raises it.
    clearOnShow()
    document.addEventListener('visibilitychange', clearOnShow)

    return () => document.removeEventListener('visibilitychange', clearOnShow)
  }, [takenWhileHidden])

  return takenWhileHidden
}
