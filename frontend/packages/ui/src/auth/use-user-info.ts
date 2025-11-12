import { useGetUserInfoQuery } from './auth.api'

const useUserInfo = () => {
  const { data, isLoading, isUninitialized, isError, isFetching } =
    useGetUserInfoQuery()

  return {
    userInfo: data,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useUserInfo
