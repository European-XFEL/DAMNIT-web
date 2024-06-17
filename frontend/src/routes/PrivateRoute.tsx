/**
 * This is inspired from the tutorial:
 * React 18 + Redux - JWT Authentication Example & Tutorial
 * https://jasonwatmore.com/post/2022/06/15/react-18-redux-jwt-authentication-example-tutorial
 */

import React from "react"
import { Navigate } from "react-router-dom"
import { useSelector } from "react-redux"

import { history } from "./history"

function PrivateRoute({ children }) {
  // TODO: Check session cookies
  // const { user: authUser } = useSelector((state) => state.auth)
  const authUser = "xfel"

  if (!authUser) {
    // not logged in so redirect to login page with the return url
    return <Navigate to="/login" state={{ from: history.location }} />
  }

  // authorized so return child components
  return children
}

export default PrivateRoute
