import type { RootState } from '#src/app/store/types'

export const selectActiveView = (state: RootState) => state.dashboard.activeView

export const selectNavCollapsed = (state: RootState) =>
  state.dashboard.nav.collapsed

export const selectMobileNavOpened = (state: RootState) =>
  state.dashboard.nav.mobileOpened
