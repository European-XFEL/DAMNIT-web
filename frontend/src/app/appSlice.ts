import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  initialized: false,
}

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    initialize(state) {
      state.initialized = true
    },
  },
})

export const { initialize } = appSlice.actions
export default appSlice.reducer
