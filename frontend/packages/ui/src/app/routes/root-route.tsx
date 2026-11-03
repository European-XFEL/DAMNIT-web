import { Outlet } from 'react-router'

import useUmami from '#src/lib/analytics/use-umami'
function RootRoute() {
  useUmami()

  return <Outlet />
}

export default RootRoute
