// The store's public type surface. Features read the store through this file
// rather than reaching into the reducer assembly, which knows every feature.
export type { RootState } from './reducer'
export type { AppDispatch, AppStore } from './store'
