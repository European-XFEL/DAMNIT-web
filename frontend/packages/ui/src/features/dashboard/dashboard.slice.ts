import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '../../redux/actions'
import { type TabItem } from '../../types'

type MainState = {
  tabs: Record<string, TabItem>
  currentTab: string
  previousTab?: string
}

type NavState = {
  isOpened: boolean
}

type AsideState = {
  tabs: Record<string, TabItem>
  isOpened: boolean
}

type DasboardState = {
  main: MainState
  nav: NavState
  aside: AsideState
}

const initialState: DasboardState = {
  main: {
    tabs: { table: { title: 'Table' }, editor: { title: 'Context File' } },
    currentTab: 'table',
  },
  nav: {
    isOpened: false,
  },
  aside: {
    isOpened: false,
    tabs: { run: { title: 'Run', isClosable: false } },
  },
}

const slice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    // Main
    setCurrentTab: (state, action) => {
      const id = action.payload
      if (id in state.main.tabs && id !== state.main.currentTab) {
        state.main.previousTab = state.main.currentTab
        state.main.currentTab = id
      }
    },
    addTab: (state, action) => {
      const { id, ...rest } = action.payload
      if (id !== state.main.currentTab) {
        state.main.previousTab = state.main.currentTab
      }
      state.main.currentTab = id
      state.main.tabs = Object.assign(state.main.tabs || {}, { [id]: rest })
    },
    removeTab: (state, action: PayloadAction<string>) => {
      const removed = action.payload
      const { [removed]: _ = {}, ...rest } = state.main.tabs

      if (state.main.currentTab === removed) {
        const { previousTab } = state.main
        state.main.currentTab =
          previousTab && previousTab in rest
            ? previousTab
            : Object.keys(rest).slice(-1)[0]
      }
      if (state.main.previousTab === removed) {
        state.main.previousTab = undefined
      }
      state.main.tabs = rest
    },

    // Nav
    openNav: (state) => {
      state.nav.isOpened = true
    },
    closeNav: (state) => {
      state.nav.isOpened = false
    },

    // Aside
    openAside: (state) => {
      state.aside.isOpened = true
    },
    closeAside: (state) => {
      state.aside.isOpened = false
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const {
  addTab,
  removeTab,
  setCurrentTab,
  openNav,
  closeNav,
  openAside,
  closeAside,
} = slice.actions
