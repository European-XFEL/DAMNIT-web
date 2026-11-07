import { useEffect } from 'react'
import { useHref, useSearchParams } from 'react-router'

import { login } from '#src/features/auth/auth.thunks'
import { useAppDispatch } from '#src/app/store/hooks'

const LoginRoute = () => {
  const dispatch = useAppDispatch()
  const [searchParams] = useSearchParams()
  const target = useHref(searchParams.get('next') || '/home')

  useEffect(() => {
    dispatch(login(target))
  }, [dispatch, target])

  return <div />
}

export default LoginRoute
