import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { type TabItem } from '../../types'
import { createMap } from '../../utils/helpers'

export type MainContent =
  | { kind: 'table' }
  | { kind: 'contextFile' }
  | { kind: 'plots' }

type MainView = {
  id: string
  title: string
  content: MainContent
}

type MainState = {
  view: MainView
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

export const DEFAULT_MAIN_VIEWS: Map<string, MainView> = createMap(
  [
    { id: 'default-table', title: 'Table', content: { kind: 'table' } },
    {
      id: 'default-context-file',
      title: 'Context File',
      content: { kind: 'contextFile' },
    },
    { id: 'default-plots', title: 'Plots', content: { kind: 'plots' } },
  ],
  'id'
)

const initialState: DasboardState = {
  main: { view: DEFAULT_MAIN_VIEWS.get('default-table')! },
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
    reset: () => initialState,
    // Main
    setMainView: (state, action: PayloadAction<MainView['id']>) => {
      state.main.view = DEFAULT_MAIN_VIEWS.get(action.payload)!
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
})

export default slice.reducer
export const { openNav, closeNav, openAside, closeAside, reset, setMainView } =
  slice.actions
