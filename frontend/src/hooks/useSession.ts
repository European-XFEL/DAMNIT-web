import { useDispatch } from "react-redux"
import { useGetSessionQuery, authApi } from "../features/api/"

const useSession = () => {
  const dispatch = useDispatch()
  const {
    data: session,
    isLoading,
    isUninitialized,
    isError,
    refetch,
    isFetching,
  } = useGetSessionQuery()

  const invalidate = () => {
    dispatch(authApi.util.invalidateTags(["Session"]))
    // dispatch(authApi.util.resetApiState())
    refetch()
  }

  return {
    session,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
    invalidate,
  }
}

export default useSession
