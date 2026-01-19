import { type RouteObject, createHashRouter } from 'react-router'

import { RootRoute, loadRootData } from './routes/root'
import { ExampleRoute, loadExampleData } from './routes/example'

const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootRoute,
    loader: loadRootData,
  },
  {
    path: '/example/:example_name',
    Component: ExampleRoute,
    loader: loadExampleData,
  },
]

export const router = createHashRouter(routes)
