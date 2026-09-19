import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { plotRequested, resetProposal } from '#src/app/store/actions'
import { type PlotSpec } from '#src/types'

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
    removePlot: (state, action: PayloadAction<string>) => {
      delete state.data[action.payload]
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(plotRequested, (state, action) => {
        const { id, ...plot } = action.payload
        state.data[id] = plot
      })
      .addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const { removePlot } = slice.actions
