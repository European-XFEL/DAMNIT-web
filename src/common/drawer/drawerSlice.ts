import { createSlice } from "@reduxjs/toolkit";

const slice = createSlice({
  name: "drawer",
  initialState: { isOpened: false },
  reducers: {
    open: (state, action) => {
      state.isOpened = true;
    },
    close: (state, action) => {
      state.isOpened = false;
    },
  },
});

export default slice.reducer;
export const { open, close } = slice.actions;
