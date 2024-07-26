import { useSelector } from "react-redux"

import { useGetProposalQuery } from "../features/api"

const useCurrentProposal = () => {
  const proposal_num = useSelector((state) => state.proposal.current.value)
  const { data, isLoading, isUninitialized, isError, isFetching } =
    useGetProposalQuery(proposal_num, { skip: !proposal_num })

  return {
    proposal: data,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useCurrentProposal
