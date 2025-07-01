import { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'

import { history } from './history'
import { useUserInfo } from '../auth'

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
