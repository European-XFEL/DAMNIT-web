import { type RouteObject, createHashRouter } from 'react-router'

import {
  ExampleRoute,
  loadExampleData,
  HomeRoute,
  loadHomeData,
} from './routes'
import { RootRoute } from '@damnit-frontend/ui'

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
      },
    ],
  },
]

export const router = createHashRouter(routes)
