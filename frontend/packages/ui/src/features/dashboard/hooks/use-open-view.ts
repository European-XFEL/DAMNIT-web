import { useMemo } from 'react'
import { type UIMatch, useLocation, useMatches } from 'react-router'

import type { ViewHandle } from '#src/features/dashboard/dashboard.routes'
import type { View } from '#src/features/dashboard/types/dashboard.types'
import { parsePlotAddress, plotAddress } from '#src/features/plots/plot-address'

function isViewHandle(handle: unknown): handle is ViewHandle {
  return typeof handle === 'object' && handle !== null && 'view' in handle
}

// The view on show, or none on a link that points at no view.
export function useOpenView(): View | undefined {
  const matches = useMatches()
  const { search } = useLocation()

  const match = matches.find((match): match is UIMatch<unknown, ViewHandle> =>
    isViewHandle(match.handle)
  )
  const view = match?.handle.view
  const plotKind = match?.params.kind

  // Every part of the dashboard asks on each render, and a plot's runs are
  // parsed and written back out, so each caller does it once per address.
  return useMemo(() => {
    if (view === undefined) {
      return undefined
    }
    if (view !== 'plot') {
      return { kind: view }
    }

    const address = parsePlotAddress(
      plotKind ?? '',
      new URLSearchParams(search)
    )

    return {
      kind: 'plot',
      id: 'plot' in address ? plotAddress(address.plot) : undefined,
    }
  }, [view, plotKind, search])
}
