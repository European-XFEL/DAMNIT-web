import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import { type PlotSpec } from '#src/types'

import { generateUID } from './utils'

type PlotsState = {
  data: Record<string, PlotSpec>
  currentPlot: string | null
}

const initialState: PlotsState = {
  data: {},
  currentPlot: null,
}

const slice = createSlice({
  name: 'plots',
  initialState,
  reducers: {
    setCurrentPlot: (state, action) => {
      const id = action.payload
      if (state.data && id in state.data) {
        state.currentPlot = id
      }
    },
    addPlot: (state, action: PayloadAction<PlotSpec>) => {
      const { variables, runs, source, title } = action.payload
      const id = generateUID()
      state.currentPlot = id
      state.data = Object.assign(state.data || {}, {
        [id]: { variables, runs, source, title },
      })
    },
    removePlot: (state, action) => {
      const { [action.payload]: _ = {}, ...rest } = state.data
      const plots = Object.keys(rest)
      state.currentPlot = plots.length ? plots.slice(-1)[0] : null
      state.data = plots.length ? rest : {}
    },
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const { addPlot, reset, removePlot, setCurrentPlot } = slice.actions
