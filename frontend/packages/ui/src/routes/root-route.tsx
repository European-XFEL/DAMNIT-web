import { Outlet } from 'react-router'

import useUmami from '../analytics/umami/useUmami'
function RootRoute() {
  useUmami()

  return <Outlet />
}

export default RootRoute
