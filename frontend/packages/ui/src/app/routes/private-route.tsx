import { type PropsWithChildren } from 'react'
import { Navigate } from 'react-router'

import useUserInfo from '#src/features/auth/use-user-info'

import { history } from './history'
function PrivateRoute({ children }: PropsWithChildren) {
  const { userInfo, isLoading, isError } = useUserInfo()

  if (isLoading) {
    return <div />
  }

  if (!userInfo || isError) {
    return <Navigate to="/login" state={{ from: history.getLocation() }} />
  }

  return children
}

export default PrivateRoute
