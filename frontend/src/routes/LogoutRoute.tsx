import React, { useEffect } from "react"
import { useDispatch } from "react-redux"

import { logout } from "../features/auth"

const LogoutRoute = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(logout())
  }, [])

  return <div />
}

export default LogoutRoute
