import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  main: { tabs: { table: { title: "Table" } }, currentTab: "table" },
  aside: {
    isOpened: false,
    tabs: { run: { title: "Run", isClosable: false } },
  },
}

const slice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    // Main
    setCurrentTab: (state, action) => {
      const id = action.payload
      if (id in state.main.tabs) {
        state.main.currentTab = id
      }
    },
    addTab: (state, action) => {
      const { id, ...rest } = action.payload
      state.main.currentTab = id
      state.main.tabs = Object.assign(state.main.tabs || {}, { [id]: rest })
    },
    removeTab: (state, action) => {
      const { [action.payload]: _ = {}, ...rest } = state.main.tabs
      state.main.currentTab = Object.keys(rest).slice(-1)[0]
      state.main.tabs = rest
    },

    // Aside
    openAside: (state, _) => {
      state.aside.isOpened = true
    },
    closeAside: (state, _) => {
      state.aside.isOpened = false
    },
  },
})

export default slice.reducer
export const { addTab, removeTab, setCurrentTab, openAside, closeAside } =
  slice.actions
