// Mantine's own styles, so the rail popover is positioned and sized as in the app.
import '@mantine/core/styles.layer.css'

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { AppShell } from '@mantine/core'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'

import { setupStore, type AppStore } from '#src/app/store/store'
import DashboardNavbar from '#src/features/dashboard/components/navbar/dashboard-navbar'
import {
  navCollapsed,
  viewSelected,
} from '#src/features/dashboard/stores/dashboard.slice'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'
import { addPlot } from '#src/features/plots/plots.slice'
import { type PlotSpec } from '#src/types'
import { withProviders } from '#tests/support/render'
import { resizeViewport } from '#tests/support/viewport'

const trains: PlotSpec = {
  variables: ['run', 'n_trains'],
  runs: ['1', '2', '3'],
  source: 'summary',
  name: 'Trains vs. Run',
}

const pulses: PlotSpec = {
  variables: ['run', 'n_pulses'],
  runs: ['4', '5'],
  source: 'summary',
  name: 'Pulses vs. Run',
}

const ada: DashboardUser = {
  name: 'Ada Lovelace',
  onLogout: () => {},
}

// No proposal is set, so the plot dialog's variables read is skipped and Apollo
// only has to be present, never reached.
function renderNav(store: AppStore, { user }: { user?: DashboardUser } = {}) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.empty(),
  })

  return render(
    <AppShell navbar={{ width: 280, breakpoint: 0 }}>
      <AppShell.Navbar>
        <DashboardNavbar user={user} />
      </AppShell.Navbar>
    </AppShell>,
    { wrapper: withProviders({ store, client }) }
  )
}

type Screen = Awaited<ReturnType<typeof renderNav>>

// The trap moves focus in a tick after the popover opens, so keys wait for it.
async function openRailPlots(screen: Screen) {
  await screen.getByRole('button', { name: 'Plots', exact: true }).click()
  const popover = screen.getByRole('dialog', { name: 'Plots' })
  await expect
    .poll(() => popover.element().contains(document.activeElement))
    .toBe(true)
}

test('a new plot appears under Plots as the view on show', async () => {
  const store = setupStore()
  const screen = await renderNav(store)

  store.dispatch(addPlot(trains))

  const entry = screen.getByRole('button', { name: /^Trains vs. Run/ })
  await expect.element(entry).toHaveTextContent('Runs 1-3')
  await expect.element(entry).toHaveAttribute('aria-current', 'page')
  await expect
    .element(screen.getByRole('button', { name: 'All runs', exact: true }))
    .not.toHaveAttribute('aria-current')
})

test('an entry shows the plot name and spells its kind out only for screen readers', async () => {
  const store = setupStore()
  store.dispatch(addPlot(trains))
  const screen = await renderNav(store)

  const entry = screen.getByRole('button', {
    name: 'Trains vs. Run, summary plot, Runs 1-3',
    exact: true,
  })
  await expect.element(entry).toBeVisible()
  await expect.element(entry).toHaveTextContent('Trains vs. Run')
  await expect.element(entry).not.toHaveTextContent(/summary/i)
})

test('the Plots section names itself empty until a plot is opened', async () => {
  const store = setupStore()
  const screen = await renderNav(store)

  // With nothing open, the section says so
  await expect.element(screen.getByText('(None)')).toBeVisible()

  // Opening a plot puts its row where the placeholder was
  store.dispatch(addPlot(trains))

  await expect
    .element(screen.getByRole('button', { name: /^Trains vs. Run/ }))
    .toBeVisible()
  await expect.element(screen.getByText('(None)')).not.toBeInTheDocument()
})

test('the Table and Plots headers are labels that never switch the view', async () => {
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(viewSelected({ kind: 'table' }))
  const screen = await renderNav(store)

  // Neither header is a button
  await expect
    .element(screen.getByRole('button', { name: 'Table', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('button', { name: 'Plots', exact: true }))
    .not.toBeInTheDocument()

  // Clicking the Plots label keeps the table
  await screen.getByText('Plots', { exact: true }).click()

  await expect
    .element(screen.getByRole('button', { name: 'All runs', exact: true }))
    .toHaveAttribute('aria-current', 'page')
})

test('All runs under Table shows the table', async () => {
  const store = setupStore()
  store.dispatch(viewSelected({ kind: 'context-file' }))
  const screen = await renderNav(store)

  const allRuns = screen.getByRole('button', { name: 'All runs', exact: true })
  await allRuns.click()

  await expect.element(allRuns).toHaveAttribute('aria-current', 'page')
})

test('the close mark shows only while its entry is hovered or focused', async () => {
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(addPlot(pulses))
  const screen = await renderNav(store)
  const marks = screen.getByRole('button', {
    name: /^Close /,
    includeHidden: true,
  })

  // Before any hover both marks are hidden, the shown plot's included
  await expect.element(marks.nth(0)).not.toBeVisible()
  await expect.element(marks.nth(1)).not.toBeVisible()

  // Hovering the Trains entry brings its mark out
  await screen.getByRole('button', { name: /^Trains vs. Run/ }).hover()
  await expect.element(marks.nth(0)).toBeVisible()

  // Tab from the Pulses entry lands on its mark
  const pulsesEntry = screen.getByRole('button', { name: /^Pulses vs. Run/ })
  const pulsesButton = pulsesEntry.element() as HTMLElement
  pulsesButton.focus()
  await userEvent.tab()
  await expect.element(marks.nth(1)).toHaveFocus()
  await expect.element(marks.nth(1)).toBeVisible()
})

test('closing a plot entry removes it from the nav', async () => {
  const store = setupStore()
  store.dispatch(addPlot(trains))
  const screen = await renderNav(store)

  await screen.getByRole('button', { name: /^Trains vs. Run/ }).hover()
  await screen.getByRole('button', { name: /^Close Trains vs. Run/ }).click()

  await expect
    .element(screen.getByRole('button', { name: /^Trains vs. Run/ }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('button', { name: 'All runs', exact: true }))
    .toHaveAttribute('aria-current', 'page')
})

test('the plus beside Plots opens the plot settings', async () => {
  const screen = await renderNav(setupStore())

  await screen.getByRole('button', { name: 'New plot' }).click()

  await expect
    .element(screen.getByRole('dialog', { name: 'Plot Settings' }))
    .toBeVisible()
})

test('the rail lists the open plots and New plot in its popover', async () => {
  // The rail only exists from the `sm` breakpoint up.
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(addPlot(pulses))
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)

  await screen.getByRole('button', { name: 'Plots', exact: true }).click()

  await expect
    .element(screen.getByRole('button', { name: /^Trains vs. Run/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /^Pulses vs. Run/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'New plot' }))
    .toBeVisible()
})

test('picking a plot in the rail shows it and closes the popover', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(viewSelected({ kind: 'table' }))
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)
  const plots = screen.getByRole('button', { name: 'Plots', exact: true })

  await plots.click()
  await screen.getByRole('button', { name: /^Trains vs. Run/ }).click()

  await expect
    .element(screen.getByRole('dialog', { name: 'Plots' }))
    .not.toBeInTheDocument()
  await expect.element(plots).toHaveAttribute('aria-current', 'page')
})

test('closing a plot in the rail keeps the popover open', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(addPlot(pulses))
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)
  const plots = screen.getByRole('button', { name: 'Plots', exact: true })

  await plots.click()
  await screen.getByRole('button', { name: /^Trains vs. Run/ }).hover()
  await screen.getByRole('button', { name: /^Close Trains vs. Run/ }).click()

  await expect.element(plots).toHaveAttribute('aria-expanded', 'true')
  await expect
    .element(screen.getByRole('button', { name: /^Trains vs. Run/ }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('button', { name: /^Pulses vs. Run/ }))
    .toBeVisible()
})

test('the rail popover takes focus on open without showing a close mark', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)

  await openRailPlots(screen)

  await expect
    .element(
      screen.getByRole('button', { name: /^Close Trains/, includeHidden: true })
    )
    .not.toBeVisible()
})

test('Escape closes the rail popover and hands focus back to Plots', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)

  await openRailPlots(screen)
  await userEvent.keyboard('{Escape}')

  await expect
    .element(screen.getByRole('dialog', { name: 'Plots' }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('button', { name: 'Plots', exact: true }))
    .toHaveFocus()
})

test('Shift+Tab as the rail popover opens wraps to New plot', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  store.dispatch(addPlot(trains))
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)

  await openRailPlots(screen)
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}')

  await expect
    .element(screen.getByRole('button', { name: 'New plot' }))
    .toHaveFocus()
})

test('the rail popover stays inside a short window, its plots scrolling above a full-height New plot', async () => {
  await resizeViewport({ width: 1024, height: 480 })
  const store = setupStore()
  for (let run = 1; run <= 15; run++) {
    store.dispatch(addPlot({ ...trains, runs: [String(run)] }))
  }
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)

  await screen.getByRole('button', { name: 'Plots', exact: true }).click()

  // New plot is in view at its full height without scrolling
  const newPlot = screen.getByRole('button', { name: 'New plot' })
  await expect.element(newPlot).toBeInViewport({ ratio: 1 })
  expect(newPlot.element().getBoundingClientRect().height).toBe(32)

  // The last plot scrolls into view
  const lastPlot = screen.getByRole('button', {
    name: /^Trains vs. Run, .*Run 15$/,
  })
  const lastPlotItem = lastPlot.element() as HTMLElement
  lastPlotItem.scrollIntoView()
  await expect.element(lastPlot).toBeInViewport()
  await expect.element(newPlot).toBeInViewport({ ratio: 1 })
})

test('the nav foot names the user, and the rail keeps only their initials', async () => {
  await resizeViewport({ width: 1024, height: 768 })
  const store = setupStore()
  const screen = await renderNav(store, { user: ada })

  // Expanded, the foot shows the full name, the button named by it alone
  await expect
    .element(screen.getByRole('button', { name: 'Ada Lovelace', exact: true }))
    .toHaveTextContent('Ada Lovelace')

  // Folded to the rail, only the avatar is left, still named for the user
  store.dispatch(navCollapsed())
  await expect
    .element(screen.getByRole('button', { name: 'Ada Lovelace', exact: true }))
    .toHaveTextContent('AL')
  await expect.element(screen.getByText('Ada Lovelace')).not.toBeInTheDocument()
})

test('below the sm breakpoint a collapsed nav still opens in full', async () => {
  const store = setupStore()
  store.dispatch(navCollapsed())
  const screen = await renderNav(store)

  await expect
    .element(screen.getByRole('button', { name: 'All runs', exact: true }))
    .toBeVisible()
})
