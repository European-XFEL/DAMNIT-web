import { useEffect, useState } from "react"

import { metadataApi } from "./metadata.api"
import { isArrayEqual } from "../../utils/array"
import useQueries from "../../hooks/useQueries"

type ProposalInfo = {
  number: number
  instrument: string
  title: string
  principal_investigator: string

  start_date: string
  end_date: string
  run_cycle: string

  proposal_path: string
  damnit_path: string
}

const useProposals = (proposals: string[]) => {
  const [queries, setQueries] = useState<string[]>([])

  useEffect(() => {
    // Get the new time series data from the attributes
    setQueries((current) =>
      isArrayEqual(current, proposals) ? current : proposals,
    )
  }, [proposals])

  const { data, isLoading, isUninitialized, isFetching, isError } = useQueries(
    metadataApi.endpoints.getProposal,
    queries,
  )

  return {
    proposals: data as ProposalInfo[],
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useProposals
