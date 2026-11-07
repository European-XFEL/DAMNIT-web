import { Navigate, Outlet } from 'react-router'

import useUserInfo from '#src/features/auth/use-user-info'

function PrivateRoute() {
  const { userInfo, isLoading, isError } = useUserInfo()

  if (isLoading) {
    return <div />
  }

  if (!userInfo || isError) {
    return <Navigate to="/login" />
  }

  return <Outlet />
}

export default PrivateRoute
