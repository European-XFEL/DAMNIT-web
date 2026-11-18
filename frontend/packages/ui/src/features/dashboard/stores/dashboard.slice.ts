import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import { removePlot } from '#src/features/plots/plots.slice'

type NavState = {
  collapsed: boolean
  mobileOpened: boolean
}

// `plotId` is set when the view was a plot, so closing that plot forgets it.
export type PreviousView = {
  url: string
  plotId?: string
}

type DashboardState = {
  previousView?: PreviousView
  nav: NavState
}

const initialState: DashboardState = {
  nav: {
    collapsed: false,
    mobileOpened: false,
  },
}

const slice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    viewLeft: (state, action: PayloadAction<PreviousView>) => {
      state.previousView = action.payload
    },
    mobileNavClosed: (state) => {
      state.nav.mobileOpened = false
    },
    navCollapsed: (state) => {
      state.nav.collapsed = true
    },
    navExpanded: (state) => {
      state.nav.collapsed = false
    },
    mobileNavToggled: (state) => {
      state.nav.mobileOpened = !state.nav.mobileOpened
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(removePlot, (state, action) => {
        if (state.previousView?.plotId === action.payload) {
          state.previousView = undefined
        }
      })
      .addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const {
  viewLeft,
  mobileNavClosed,
  navCollapsed,
  navExpanded,
  mobileNavToggled,
} = slice.actions
