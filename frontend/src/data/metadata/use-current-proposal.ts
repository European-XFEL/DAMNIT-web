import { useGetProposalQuery } from './metadata.api'
import { useAppSelector } from '../../redux'

const useCurrentProposal = () => {
  const proposal_num = useAppSelector((state) => state.metadata.proposal.value)
  const { data, isLoading, isUninitialized, isError, isFetching } =
    useGetProposalQuery(proposal_num, { skip: !proposal_num })

  return {
    proposal: data,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useCurrentProposal
