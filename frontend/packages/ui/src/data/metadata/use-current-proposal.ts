import { useGetProposalQuery } from './metadata.api'
import { useAppSelector } from '../../redux/hooks'

const useCurrentProposal = () => {
  const proposal_number = useAppSelector((state) => state.metadata.proposal.value)
  const { data, isLoading, isUninitialized, isError, isFetching } =
    useGetProposalQuery(proposal_number, { skip: !proposal_number })

  return {
    proposal: data,
    isLoading: isLoading || isUninitialized || isFetching,
    isError,
  }
}

export default useCurrentProposal
