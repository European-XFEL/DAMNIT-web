import { createAction } from '@reduxjs/toolkit'

// Store-level actions no single slice owns. It imports only @reduxjs/toolkit,
// so a slice can import it without a cycle through the reducer.

export const resetProposal = createAction('app/resetProposal')
