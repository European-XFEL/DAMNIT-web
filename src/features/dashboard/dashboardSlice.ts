import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  tabs: { table: { title: "Table" } },
  currentTab: "table",
};

const slice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    setCurrentTab: (state, action) => {
      state.currentTab = action.payload;
    },
    addTab: (state, action) => {
      const { id, ...rest } = action.payload;
      state.tabs = Object.assign(state.tabs || {}, { [id]: rest });
      state.currentTab = id;
    },
    removeTab: (state, action) => {
      const { [action.payload]: _ = {}, ...rest } = state.tabs;
      state.tabs = rest;
      state.currentTab = Object.keys(rest).slice(-1)[0];
    },
  },
});

export default slice.reducer;
export const { addTab, removeTab } = slice.actions;
