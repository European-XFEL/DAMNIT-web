export { default } from './dashboard'
export { default as DashboardBase } from './dashboard.base'
export { default as DashboardMain } from './dashboard.main'
export {
  default as dashboardReducer,
  reset as resetDashboard,
  addTab,
  removeTab,
  setCurrentTab,
  openNav,
  closeNav,
  openAside,
  closeAside,
} from './dashboard.slice'
