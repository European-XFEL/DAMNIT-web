import type { RootState } from '#src/app/store/types'

export const selectPreviousView = (state: RootState) =>
  state.dashboard.previousView

export const selectNavCollapsed = (state: RootState) =>
  state.dashboard.nav.collapsed

export const selectMobileNavOpened = (state: RootState) =>
  state.dashboard.nav.mobileOpened
