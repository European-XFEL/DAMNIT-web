import React, { useEffect } from 'react'

import { logout } from '../auth'
import { useAppDispatch } from '../redux'

const LogoutRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(logout())
  })

  return <div />
}

export default LogoutRoute
