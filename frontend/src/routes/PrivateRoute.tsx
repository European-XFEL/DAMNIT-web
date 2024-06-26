import React from "react"
import { Navigate } from "react-router-dom"
import { useSelector } from "react-redux"

import { history } from "./history"

function PrivateRoute({ children }) {
  const { initialized } = useSelector((state) => state.app)
  const { user: authUser } = useSelector((state) => state.auth)

  if (!initialized) {
    return
  }

  if (!authUser) {
    return <Navigate to="/login" state={{ from: history.location }} />
  }

  return children
}

export default PrivateRoute
