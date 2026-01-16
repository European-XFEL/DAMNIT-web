import { type RouteObject, createBrowserRouter } from 'react-router'

import { BASE_URL } from '@damnit-frontend/ui'

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

export const router = createBrowserRouter(routes, {
  basename: BASE_URL,
})
