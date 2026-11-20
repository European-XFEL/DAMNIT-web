import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useResolvedPath } from 'react-router'

import {
  acceptPlotRequest,
  readPlotRequest,
  reportPlotShown,
  type ViewAddress,
} from '#src/features/dashboard/utils/opener-messages'
import { nameDashboardWindow } from '#src/utils/popup'

// Through the router, so the nav's plot list and the table's state stay.
export function useTakePlotFromPopup() {
  const navigate = useNavigate()
  const location = useLocation()
  const plotsPath = useResolvedPath('plots').pathname
  const taken = useRef<{
    id: string
    to: ViewAddress
    source: MessageEventSource | null
  }>(undefined)

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
}
