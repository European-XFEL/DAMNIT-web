import { createSlice } from "@reduxjs/toolkit";
import { formatPlot } from "./utils";

const initialState = {
  data: null,
  currentPlot: null,
};

const slice = createSlice({
  name: "plots",
  initialState,
  reducers: {
    setCurrentPlot: (state, action) => {
      const id = action.payload;
      if (state.data && state.data.hasOwnProperty(id)) {
        state.currentPlot = id;
      }
    },
    addPlot: (state, action) => {
      const { id, ...rest } = formatPlot(action.payload);
      state.currentPlot = id;
      state.data = Object.assign(state.data || {}, { [id]: rest });
    },
    removePlot: (state, action) => {
      const { [action.payload]: _ = {}, ...rest } = state.data;
      const plots = Object.keys(rest);
      state.currentPlot = plots.length ? plots.slice(-1)[0] : null;
      state.data = plots.length ? rest : null;
    },
    clearPlots: (state) => {
      state.currentPlot = null;
      state.data = null;
    },
  },
});

export default slice.reducer;
export const { addPlot, clearPlots, removePlot, setCurrentPlot } =
  slice.actions;
