import { createAction } from '@reduxjs/toolkit'

import { plotAddress } from '#src/features/plots/plot-address'
import type { PlotSpec } from '#src/types'

// Store-level actions no single slice owns. It imports no slice, so a slice
// can import it without a cycle through the reducer.

export const resetProposal = createAction('app/resetProposal')

// Both the new-plot dialog and the table's context menu ask for plots. A plot's
// id is its address, so asking for a listed plot again picks the same entry.
export const plotRequested = createAction(
  'app/plotRequested',
  (plot: PlotSpec) => ({ payload: { ...plot, id: plotAddress(plot) } })
)
