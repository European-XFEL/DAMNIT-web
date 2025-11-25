import type { RouteObject } from 'react-router'
import { AboutPage, HeroPage } from './pages'

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: HeroPage,
  },
  {
    path: '/about',
    Component: AboutPage,
  },
]
