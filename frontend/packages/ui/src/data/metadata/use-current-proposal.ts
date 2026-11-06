import { useAppSelector } from '#src/app/store/hooks'

import useProposals from './use-proposals'

const useCurrentProposal = () => {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { proposals, isLoading, isError } = useProposals({
    proposals: [Number(proposal)],
    full: true,
  })

  return {
    proposal: proposals?.[0],
    isLoading,
    isError,
  }
}

export default useCurrentProposal
