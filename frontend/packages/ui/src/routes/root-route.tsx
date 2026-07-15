import { Outlet } from 'react-router'

import useUmami from '#src/analytics/umami/useUmami'
function RootRoute() {
  useUmami()

  return <Outlet />
}

export default RootRoute
