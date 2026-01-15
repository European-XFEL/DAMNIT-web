import type { RouteObject } from 'react-router'
import { HeroPage } from './pages'

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: HeroPage,
  },
]
