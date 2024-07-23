import React, { useEffect } from "react"
import { useDispatch } from "react-redux"

import { login } from "../features/auth"

const LoginRoute = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(login())
  }, [])

  return <div />
}

export default LoginRoute
