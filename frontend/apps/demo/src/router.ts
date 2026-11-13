import { type RouteObject, createHashRouter } from 'react-router'

import { RootRoute, dashboardViewRoutes } from '@damnit-frontend/ui'

import {
  ExampleRoute,
  loadExampleData,
  HomeRoute,
  loadHomeData,
} from './routes'

const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootRoute,
    children: [
      { index: true, Component: HomeRoute, loader: loadHomeData },
      {
        path: 'example/:example_name',
        Component: ExampleRoute,
        loader: loadExampleData,
        // A plot's search changes on every move between views, which would
        // otherwise fetch the example index again.
        shouldRevalidate: ({ currentParams, nextParams }) =>
          currentParams.example_name !== nextParams.example_name,
        children: dashboardViewRoutes,
      },
    ],
  },
]

export const router = createHashRouter(routes)
