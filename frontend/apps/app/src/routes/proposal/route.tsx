import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router'

import {
  NotFoundPage,
  resetProposal,
  setProposalPending,
  useAppDispatch,
  useProposal,
} from '@damnit-frontend/ui'

const IS_TEST_MODE = import.meta.env.MODE === 'test'

type ProposalWrapperProps = { proposalNumber: string }

// ProposalRoute keys this on the proposal, so switching proposals remounts the
// subtree instead of updating it in place. Unmount dispatches resetProposal;
// see its listener for why the Apollo evict is safe to run during the switch.
function ProposalWrapper({ proposalNumber }: ProposalWrapperProps) {
  const proposal = useProposal({ subscribe: !IS_TEST_MODE })
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(setProposalPending(proposalNumber))

    return () => {
      dispatch(resetProposal())
    }
  }, [proposalNumber, dispatch])

  if (proposal.loading) {
    return <div></div>
  }

  if (proposal.notFound) {
    return <NotFoundPage />
  }

  return <Outlet />
}

function ProposalRoute() {
  const { proposal_number } = useParams()

  if (!proposal_number) {
    return <div></div>
  }

  return (
    <ProposalWrapper key={proposal_number} proposalNumber={proposal_number} />
  )
}

export default ProposalRoute
