import { type RouteObject, createBrowserRouter } from 'react-router'

import { RootRoute } from '@damnit-frontend/ui'

import { HomeRoute } from './routes'

const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootRoute,
    children: [{ index: true, Component: HomeRoute }],
  },
]

export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL,
})
