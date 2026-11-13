import type { ReactNode } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { render } from 'vitest-browser-react'

import type { AppStore } from '#src/app/store/store'
import { dashboardViewRoutes } from '#src/features/dashboard/dashboard.routes'
import { withProviders } from '#tests/support/render'

type RenderInDashboardOptions = {
  store: AppStore
  client?: ApolloClient<object>
  url?: string
}

// Draws `ui` where an app draws the dashboard, over the real view routes, so
// its links and the view on show read as in the app.
export async function renderInDashboard(
  ui: ReactNode,
  {
    store,
    client = new ApolloClient({
      cache: new InMemoryCache(),
      link: ApolloLink.empty(),
    }),
    url = '/proposal/6996/table',
  }: RenderInDashboardOptions
) {
  const router = createMemoryRouter(
    [
      {
        path: '/proposal/:proposal_number',
        element: ui,
        children: dashboardViewRoutes,
      },
    ],
    { initialEntries: [url] }
  )
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: withProviders({ store, client }),
  })

  return { screen, router }
}

// Where the router is now, as the address bar shows it.
export function currentUrl(router: ReturnType<typeof createMemoryRouter>) {
  const { pathname, search } = router.state.location
  return pathname + search
}
