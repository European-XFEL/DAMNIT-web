import { createSlice } from "@reduxjs/toolkit";
import { formatPlot } from "./utils";

const initialState = {
  data: {},
  currentPlot: "",
};

const slice = createSlice({
  name: "plots",
  initialState,
  reducers: {
    seCurrentPlot: (state, action) => {
      const id = action.payload;
      if (state.data.hasOwnProperty(id)) {
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
      state.currentPlot = Object.keys(rest).slice(-1)[0];
      state.data = rest;
    },
  },
});

export default slice.reducer;
export const { addPlot, removePlot, seCurrentPlot } = slice.actions;
