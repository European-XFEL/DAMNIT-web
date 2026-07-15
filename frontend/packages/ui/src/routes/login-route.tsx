import { useEffect } from 'react'

import { login } from '../auth/auth.thunks'
import { useAppDispatch } from '../redux/hooks'

const LoginRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(login())
  })

  return <div />
}

export default LoginRoute
