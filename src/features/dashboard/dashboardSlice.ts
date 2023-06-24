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
      const id = action.payload;
      if (state.tabs.hasOwnProperty(id)) {
        state.currentTab = id;
      }
    },
    addTab: (state, action) => {
      const { id, ...rest } = action.payload;
      state.currentTab = id;
      state.tabs = Object.assign(state.tabs || {}, { [id]: rest });
    },
    removeTab: (state, action) => {
      const { [action.payload]: _ = {}, ...rest } = state.tabs;
      state.currentTab = Object.keys(rest).slice(-1)[0];
      state.tabs = rest;
    },
  },
});

export default slice.reducer;
export const { addTab, removeTab, setCurrentTab } = slice.actions;
