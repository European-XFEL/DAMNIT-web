import { useEffect, useState } from 'react'

import { metadataApi } from './metadata.api'
import useQueries from '../../hooks/use-queries'
import { type ProposalInfo } from '../../types'
import { isArrayEqual } from '../../utils/array'

const useProposals = (proposals: string[]) => {
  const [queries, setQueries] = useState<string[]>([])

  useEffect(() => {
    // Get the new time series data from the attributes
    setQueries((current) =>
      isArrayEqual(current, proposals) ? current : proposals
    )
  }, [proposals])

  const { data, isLoading, isUninitialized, isFetching, isError } = useQueries(
    metadataApi.endpoints.getProposal,
    queries
  )

  return {
    proposals: data as ProposalInfo[],
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useProposals
