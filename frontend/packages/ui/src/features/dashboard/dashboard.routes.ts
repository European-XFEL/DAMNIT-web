import type { ComponentType } from 'react'
import { replace, type RouteObject } from 'react-router'

import CenteredLoader from '#src/components/feedback/centered-loader'
import NotFoundView from '#src/features/dashboard/components/views/not-found-view'
import type { View } from '#src/features/dashboard/types/dashboard.types'

// What each view route carries in its `handle`, so code anywhere under the
// dashboard can tell which view the address shows.
export type ViewHandle = { view: View['kind'] }

// The `import()` stays with each caller, so the bundler splits every view off.
function viewRoute({
  path,
  view,
  load,
}: {
  path: string
  view: ViewHandle['view']
  load: () => Promise<{ default: ComponentType }>
}): RouteObject {
  return {
    path,
    lazy: { Component: async () => (await load()).default },
    HydrateFallback: CenteredLoader,
    handle: { view } satisfies ViewHandle,
  }
}

// The dashboard's views, for an app to mount under the route that draws the
// dashboard around an `Outlet`. A reload draws the frame around the loader.
export const dashboardViewRoutes: RouteObject[] = [
  // Replaces the bare address, so Back from the table never lands on it and
  // is sent forward again.
  {
    index: true,
    loader: () => replace('table'),
    // Neither ever draws past the loader, but a route without them warns.
    Component: CenteredLoader,
    HydrateFallback: CenteredLoader,
  },
  viewRoute({
    path: 'table',
    view: 'table',
    load: () => import('#src/features/dashboard/components/views/table-view'),
  }),
  viewRoute({
    path: 'context-file',
    view: 'context-file',
    load: () => import('#src/features/context-file/context-file'),
  }),
  viewRoute({
    path: 'plots/:kind',
    view: 'plot',
    load: () => import('#src/features/dashboard/components/views/plot-view'),
  }),
  { path: '*', Component: NotFoundView },
]
