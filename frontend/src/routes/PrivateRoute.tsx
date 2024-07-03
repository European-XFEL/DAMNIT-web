import React from "react"
import { Navigate } from "react-router-dom"

import { history } from "./history"
import { useSession } from "../hooks"

function PrivateRoute({ children }) {
  const { session, isLoading, isError } = useSession()

  if (isLoading) {
    return <div />
  }

  if (!session || isError) {
    return <Navigate to="/login" state={{ from: history.location }} />
  }

  return children
}

export default PrivateRoute
