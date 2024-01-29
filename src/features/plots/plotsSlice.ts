import { createSlice } from "@reduxjs/toolkit"
import { generateUID } from "./utils"

const initialState = {
  data: {},
  currentPlot: null,
}

const slice = createSlice({
  name: "plots",
  initialState,
  reducers: {
    setCurrentPlot: (state, action) => {
      const id = action.payload
      if (state.data && state.data.hasOwnProperty(id)) {
        state.currentPlot = id
      }
    },
    addPlot: (state, action) => {
      const { variables, runs, source } = action.payload
      const id = generateUID()
      state.currentPlot = id
      state.data = Object.assign(state.data || {}, {
        [id]: { variables, runs, source },
      })
    },
    removePlot: (state, action) => {
      const { [action.payload]: _ = {}, ...rest } = state.data
      const plots = Object.keys(rest)
      state.currentPlot = plots.length ? plots.slice(-1)[0] : null
      state.data = plots.length ? rest : {}
    },
    clearPlots: (state) => {
      state.currentPlot = null
      state.data = {}
    },
  },
})

export default slice.reducer
export const { addPlot, clearPlots, removePlot, setCurrentPlot } = slice.actions
