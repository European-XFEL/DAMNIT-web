import { replace, type RouteObject } from 'react-router'

import ContextFileView from '#src/features/dashboard/components/views/context-file-view'
import NotFoundView from '#src/features/dashboard/components/views/not-found-view'
import PlotView from '#src/features/dashboard/components/views/plot-view'
import TableView from '#src/features/dashboard/components/views/table-view'
import type { View } from '#src/features/dashboard/types/dashboard.types'

// What each view route carries in its `handle`, so code anywhere under the
// dashboard can tell which view the address shows.
export type ViewHandle = { view: View['kind'] }

// Each view has its own Suspense: a shared one hides the table while a plot's
// chunk loads, and the grid then drops right-clicks.
export const dashboardViewRoutes: RouteObject[] = [
  // Replaces the bare address, so Back from the table never lands on it and
  // is sent forward again.
  { index: true, loader: () => replace('table') },
  {
    path: 'table',
    Component: TableView,
    handle: { view: 'table' } satisfies ViewHandle,
  },
  {
    path: 'context-file',
    Component: ContextFileView,
    handle: { view: 'context-file' } satisfies ViewHandle,
  },
  {
    path: 'plots/:kind',
    Component: PlotView,
    handle: { view: 'plot' } satisfies ViewHandle,
  },
  { path: '*', Component: NotFoundView },
]
