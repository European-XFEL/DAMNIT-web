import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isOpened: false,
  tabs: { run: { title: "Run", isClosable: false } },
};

const slice = createSlice({
  name: "drawer",
  initialState,
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
