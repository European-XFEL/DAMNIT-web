import { createAction } from '@reduxjs/toolkit'

// Store-level redux primitives owned by no single slice. This module imports
// only @reduxjs/toolkit, so slices can import it without pulling in the reducer
// (which imports the slices back).

export const resetProposal = createAction('app/resetProposal')

// A subscription push must not write its runs once the user has left the
// proposal, and Apollo defers the websocket unsubscribe by a macrotask, so one
// can still arrive. The guard reads only the current proposal, narrowing to
// that shape rather than importing RootState (which would import the reducer
// back).
type ProposalState = { metadata: { proposal: { value: string } } }

export function isStaleProposal(state: unknown, proposal: string) {
  return (state as ProposalState).metadata.proposal.value !== proposal
}
