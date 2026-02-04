import { Outlet } from 'react-router'

import { useUmami } from '../analytics'

function RootRoute() {
  useUmami()

  return <Outlet />
}

export default RootRoute
