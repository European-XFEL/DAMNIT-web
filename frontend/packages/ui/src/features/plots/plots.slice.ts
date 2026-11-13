import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import type { PlotSpec } from '#src/types'

import { plotAddress } from './plot-address'

// A plot in the nav. `name` is the plot alone, such as "Pulses vs. Run"; the
// kind comes from `source`.
export type ListedPlot = PlotSpec & { name: string }

type PlotsState = {
  // By address
  data: Record<string, ListedPlot>
}

const initialState: PlotsState = {
  data: {},
}

const slice = createSlice({
  name: 'plots',
  initialState,
  reducers: {
    addPlot: (state, action: PayloadAction<ListedPlot>) => {
      state.data[plotAddress(action.payload)] ??= action.payload
    },
    removePlot: (state, action: PayloadAction<string>) => {
      delete state.data[action.payload]
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const { addPlot, removePlot } = slice.actions
