import { useEffect } from 'react'

import { logout } from '../auth/auth.thunks'
import { useAppDispatch } from '../redux/hooks'

const LogoutRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(logout())
  })

  return <div />
}

export default LogoutRoute
