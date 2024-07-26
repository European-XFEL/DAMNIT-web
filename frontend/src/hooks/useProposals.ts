import { useEffect, useState } from "react"

import { metadataApi } from "../features/api"
import { isArrayEqual } from "../utils/array"
import useQueries from "./useQueries"

const useProposals = (proposals) => {
  const [queries, setQueries] = useState([])

  useEffect(() => {
    // Get the new time series data from the attributes
    setQueries((current) =>
      isArrayEqual(current, proposals) ? current : proposals,
    )
  }, [])

  const { data, isLoading, isUninitialized, isFetching, isError } = useQueries(
    metadataApi.endpoints.getProposal,
    queries,
  )

  return {
    proposals: data,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useProposals
