import React, { useEffect } from "react"

import { login } from "../auth"
import { useAppDispatch } from "../redux"

const LoginRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(login())
  }, [])

  return <div />
}

export default LoginRoute
