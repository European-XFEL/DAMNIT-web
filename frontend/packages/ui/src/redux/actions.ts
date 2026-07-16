import { createAction } from '@reduxjs/toolkit'

// Store-level redux primitives owned by no single slice. This module imports
// only @reduxjs/toolkit, so slices can import it without pulling in the reducer
// (which imports the slices back).

export const resetProposal = createAction('app/resetProposal')

// A proposal-scoped fetch must not write its result once the user has left the
// proposal. Inside a thunk getState() is untyped; this guard reads only the
// current proposal, so it narrows to that shape rather than importing RootState
// (which would import the reducer back).
type ProposalState = { metadata: { proposal: { value: string } } }

export function isStaleProposal(state: unknown, proposal: string) {
  return (state as ProposalState).metadata.proposal.value !== proposal
}
