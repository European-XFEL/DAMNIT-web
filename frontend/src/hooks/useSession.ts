import { useGetSessionQuery } from "../features/api/"

const useSession = () => {
  const { data, isLoading, isUninitialized, isError, isFetching } =
    useGetSessionQuery()

  return {
    session: data,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useSession
