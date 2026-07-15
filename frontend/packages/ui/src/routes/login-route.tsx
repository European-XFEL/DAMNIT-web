import { useEffect } from 'react'

import { login } from '#src/auth/auth.thunks'
import { useAppDispatch } from '#src/redux/hooks'

const LoginRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(login())
  })

  return <div />
}

export default LoginRoute
