import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { plotRequested, resetProposal } from '#src/app/store/actions'
import { removePlot } from '#src/features/plots/plots.slice'
import { type View } from '#src/features/dashboard/types/dashboard.types'
import { isSameView, TABLE_VIEW } from '#src/features/dashboard/utils/views'

type NavState = {
  collapsed: boolean
  mobileOpened: boolean
}

type DashboardState = {
  activeView: View
  previousView?: View
  nav: NavState
}

const initialState: DashboardState = {
  activeView: TABLE_VIEW,
  nav: {
    collapsed: false,
    mobileOpened: false,
  },
}

// Below `sm` the nav covers the view, so whatever picks a view also closes it.
function selectView(state: DashboardState, view: View) {
  if (!isSameView(state.activeView, view)) {
    state.previousView = state.activeView
    state.activeView = view
  }
  state.nav.mobileOpened = false
}

const slice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    viewSelected: (state, action: PayloadAction<View>) => {
      selectView(state, action.payload)
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
      .addCase(plotRequested, (state, action) => {
        selectView(state, { kind: 'plot', id: action.payload.id })
      })
      // Closing the plot on show goes back to the view before it. A closed plot
      // is dropped from `previousView` too, so that step back never lands on one.
      .addCase(removePlot, (state, action) => {
        const isClosed = (view?: View) =>
          view?.kind === 'plot' && view.id === action.payload

        if (isClosed(state.activeView)) {
          state.activeView = state.previousView ?? TABLE_VIEW
          state.previousView = undefined
        } else if (isClosed(state.previousView)) {
          state.previousView = undefined
        }
      })
      .addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const { viewSelected, navCollapsed, navExpanded, mobileNavToggled } =
  slice.actions
