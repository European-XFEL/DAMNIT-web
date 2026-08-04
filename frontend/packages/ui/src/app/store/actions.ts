import { createAction } from '@reduxjs/toolkit'

// Store-level redux primitives owned by no single slice. This module imports
// only @reduxjs/toolkit, so slices can import it without pulling in the reducer
// (which imports the slices back).

export const resetProposal = createAction('app/resetProposal')
