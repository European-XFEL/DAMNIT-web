import { replace, type RouteObject } from 'react-router'

import ContextFileView from '#src/features/dashboard/components/views/context-file-view'
import PlotView from '#src/features/dashboard/components/views/plot-view'
import TableView from '#src/features/dashboard/components/views/table-view'
import type { ViewHandle } from '#src/features/dashboard/hooks/use-open-view'

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
]
