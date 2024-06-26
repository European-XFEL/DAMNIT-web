import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  user: null,
  isAuthenticated: false,
}

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload
    },
    reset: (state) => {
      state.user = initialState.user
      state.isAuthenticated = initialState.isAuthenticated
    },
  },
})

export default slice.reducer
export const { setUser, reset } = slice.actions
