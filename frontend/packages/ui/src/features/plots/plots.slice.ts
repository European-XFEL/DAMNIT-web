import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import { type PlotSpec } from '#src/types'

import { generateUID } from './utils'

type PlotsState = {
  data: Record<string, PlotSpec>
}

const initialState: PlotsState = {
  data: {},
}

const slice = createSlice({
  name: 'plots',
  initialState,
  reducers: {
    // The action carries the new id, so the dashboard shows the plot from it.
    addPlot: {
      reducer: (state, action: PayloadAction<PlotSpec & { id: string }>) => {
        const { id, ...plot } = action.payload
        state.data[id] = plot
      },
      prepare: (plot: PlotSpec) => ({
        payload: { ...plot, id: generateUID() },
      }),
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
