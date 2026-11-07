import { useEffect } from 'react'

import { logout } from '#src/features/auth/auth.thunks'
import { useAppDispatch } from '#src/app/store/hooks'

const LogoutRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(logout())
  }, [dispatch])

  return <div />
}

export default LogoutRoute
