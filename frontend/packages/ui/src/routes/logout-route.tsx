import { useEffect } from 'react'

import { logout } from '#src/auth/auth.thunks'
import { useAppDispatch } from '#src/redux/hooks'

const LogoutRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(logout())
  })

  return <div />
}

export default LogoutRoute
