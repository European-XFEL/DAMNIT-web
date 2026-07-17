import { useEffect } from 'react'

import { login } from '#src/features/auth/auth.thunks'
import { useAppDispatch } from '#src/app/store/hooks'

const LoginRoute = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(login())
  })

  return <div />
}

export default LoginRoute
