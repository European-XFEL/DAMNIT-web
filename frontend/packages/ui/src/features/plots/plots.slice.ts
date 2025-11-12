import { createSlice } from '@reduxjs/toolkit'
import { generateUID } from './utils'

type PlotItem = {
  variables: string[]
  runs: string[]
  source: string
  title?: string
}

type PlotsState = {
  data: Record<string, PlotItem>
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
    addPlot: (state, action) => {
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
    reset: (state) => {
      state.currentPlot = initialState.currentPlot
      state.data = initialState.data
    },
  },
})

export default slice.reducer
export const { addPlot, reset, removePlot, setCurrentPlot } = slice.actions
