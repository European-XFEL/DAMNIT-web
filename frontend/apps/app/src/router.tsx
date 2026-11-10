import { type RouteObject, createBrowserRouter } from 'react-router'

import {
  BASE_URL,
  Dashboard,
  HeroPage,
  LoggedOutPage,
  LoginRoute,
  LogoutRoute,
  NotFoundPage,
  PrivateRoute,
  RootRoute,
} from '@damnit-frontend/ui'

import { HomeRoute, ProposalRoute } from './routes'

const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootRoute,
    children: [
      { index: true, Component: HeroPage },
      { path: 'login', Component: LoginRoute },
      { path: 'logout', Component: LogoutRoute },
      { path: 'logged-out', Component: LoggedOutPage },
      {
        Component: PrivateRoute,
        children: [
          { path: 'home', Component: HomeRoute },
          {
            path: 'proposal/:proposal_number',
            Component: ProposalRoute,
            children: [{ index: true, Component: Dashboard }],
          },
        ],
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
]

export const router = createBrowserRouter(routes, { basename: BASE_URL })
