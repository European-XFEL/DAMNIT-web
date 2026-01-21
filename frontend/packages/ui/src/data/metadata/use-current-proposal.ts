import useProposals from './use-proposals'
import { useAppSelector } from '../../redux/hooks'
import { isEmpty } from '../../utils/helpers'

const useCurrentProposal = () => {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { proposals, isLoading, isError } = useProposals({
    proposals: [Number(proposal)],
    full: true,
  })

  return {
    proposal: isEmpty(proposals) ? undefined : proposals[0],
    isLoading,
    isError,
  }
}

export default useCurrentProposal
