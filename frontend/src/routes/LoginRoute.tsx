import React, { useEffect } from "react"

const LoginRoute = () => {
  useEffect(() => {
    window.location.href = `/oauth`
  }, [])

  return <div />
}

export default LoginRoute
