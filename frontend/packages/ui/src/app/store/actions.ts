import { createAction, nanoid } from '@reduxjs/toolkit'

import type { PlotSpec } from '#src/types'

// Store-level actions no single slice owns. It imports only @reduxjs/toolkit
// and types, so a slice can import it without a cycle through the reducer.

export const resetProposal = createAction('app/resetProposal')

// Both the new-plot dialog and the table's context menu ask for plots. The
// action carries the id, so the plots slice and the dashboard agree on it.
export const plotRequested = createAction(
  'app/plotRequested',
  (plot: PlotSpec) => ({ payload: { ...plot, id: nanoid() } })
)
