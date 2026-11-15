import {
  createPath,
  createSearchParams,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router'

import useUserInfo from '#src/features/auth/use-user-info'

function PrivateRoute() {
  const { userInfo, isLoading, isError } = useUserInfo()
  const location = useLocation()

  if (isLoading) {
    return <div />
  }

  if (!userInfo || isError) {
    const search = createSearchParams({ next: createPath(location) })
    return <Navigate to={`/login?${search}`} replace />
  }

  return <Outlet />
}

export default PrivateRoute
