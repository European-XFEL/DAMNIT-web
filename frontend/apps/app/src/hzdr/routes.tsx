import { Route } from 'react-router'
import { PrivateRoute } from '@damnit-frontend/ui'
import {
  ContextBuilderPage,
  HZDRDocsPage,
  HZDRFlowMonitorPage,
  HZDRShotPage,
  LinkExistingShotRecordsPage,
} from '.'

/**
 * The HZDR-fork-only route block, extracted from `app.tsx` so that file stays
 * close to upstream DAMNIT-web (which defines none of these routes). Returned
 * as a fragment of `<Route>` elements — React Router flattens fragment children
 * inside `<Routes>`, so drop `{hzdrRoutes()}` in among the generic routes.
 *
 * Route matching in react-router v7 is rank-based, not source-order-based, so
 * grouping these together (rather than interleaved with the generic routes, as
 * they were inline) does not change which route a path resolves to.
 */
export function hzdrRoutes() {
  return (
    <>
      <Route
        path="/docs"
        element={
          <PrivateRoute>
            <HZDRDocsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/flow-monitor"
        element={
          <PrivateRoute>
            <HZDRFlowMonitorPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/link-shot-records"
        element={
          <PrivateRoute>
            <LinkExistingShotRecordsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/source/:source_key/context-builder"
        element={
          <PrivateRoute>
            <ContextBuilderPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/source/:source_key"
        element={
          <PrivateRoute>
            <HZDRShotPage />
          </PrivateRoute>
        }
      />
    </>
  )
}
