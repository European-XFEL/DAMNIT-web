import React from "react"
import { Navigate } from "react-router-dom"

import { history } from "./history"
import { useUserInfo } from "../hooks"

function PrivateRoute({ children }) {
  const { userInfo, isLoading, isError } = useUserInfo()

  if (isLoading) {
    return <div />
  }

  if (!userInfo || isError) {
    return <Navigate to="/login" state={{ from: history.location }} />
  }

  return children
}

export default PrivateRoute
