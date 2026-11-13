import { AppShell } from '@mantine/core'
import { beforeEach, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { setupStore, type AppStore } from '#src/app/store/store'
import DashboardNavbar from '#src/features/dashboard/components/navbar/dashboard-navbar'
import {
  mobileNavToggled,
  navCollapsed,
} from '#src/features/dashboard/stores/dashboard.slice'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'
import { addPlot, type ListedPlot } from '#src/features/plots/plots.slice'
import { currentUrl, renderInDashboard } from '#tests/support/dashboard-router'
import { resizeViewport } from '#tests/support/viewport'

const trains: ListedPlot = {
  variables: ['run', 'n_trains'],
  runs: ['1', '2', '3'],
  source: 'summary',
  name: 'Trains vs. Run',
}

const pulses: ListedPlot = {
  variables: ['run', 'n_pulses'],
  runs: ['4', '5'],
  source: 'summary',
  name: 'Pulses vs. Run',
}

const intensity: ListedPlot = {
  variables: ['run', 'xgm_intensity'],
  runs: ['6'],
  source: 'summary',
  name: 'Intensity vs. Run',
}

const ada: DashboardUser = {
  name: 'Ada Lovelace',
  onLogout: () => {},
}

const TABLE = '/proposal/6996/table'
const CONTEXT_FILE = '/proposal/6996/context-file'
const TRAINS = '/proposal/6996/plots/summary?x=run&y=n_trains&runs=1-3'
const PULSES = '/proposal/6996/plots/summary?x=run&y=n_pulses&runs=4-5'

// No proposal is set, so the plot dialog's variables read is skipped and Apollo
// only has to be present, never reached.
function renderNav(
  store: AppStore,
  { user, url }: { user?: DashboardUser; url?: string } = {}
) {
  return renderInDashboard(
    <AppShell navbar={{ width: 280, breakpoint: 0 }}>
      <AppShell.Navbar>
        <DashboardNavbar user={user} />
      </AppShell.Navbar>
    </AppShell>,
    { store, url }
  )
}

type Screen = Awaited<ReturnType<typeof renderNav>>['screen']

// The trap moves focus in a tick after the popover opens, so keys wait for it.
async function openRailPlots(screen: Screen) {
  await screen.getByRole('button', { name: 'Plots', exact: true }).click()
  const popover = screen.getByRole('dialog', { name: 'Plots' })
  await expect
    .poll(() => popover.element().contains(document.activeElement))
    .toBe(true)
}

// A close mark shows only on hover or focus, and a hidden button is not in the
// accessibility tree, so hover the entry first.
async function closePlot(screen: Screen, name: string) {
  await screen.getByRole('link', { name: new RegExp(`^${name}`) }).hover()
  await screen
    .getByRole('button', { name: new RegExp(`^Close ${name}`) })
    .click()
}

describe('reading the nav', () => {
  test('the plot at the address is marked as the view on show', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    store.dispatch(addPlot(pulses))
    const { screen } = await renderNav(store, { url: TRAINS })

    const entry = screen.getByRole('link', { name: /^Trains vs. Run/ })
    await expect.element(entry).toHaveTextContent('Runs 1-3')
    await expect.element(entry).toHaveAttribute('aria-current', 'page')
    await expect
      .element(screen.getByRole('link', { name: /^Pulses vs. Run/ }))
      .not.toHaveAttribute('aria-current')
    await expect
      .element(screen.getByRole('link', { name: 'All runs', exact: true }))
      .not.toHaveAttribute('aria-current')
  })

  test('an entry shows the plot name and spells its kind out only for screen readers', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen } = await renderNav(store)

    const entry = screen.getByRole('link', {
      name: 'Trains vs. Run, summary plot, Runs 1-3',
      exact: true,
    })
    await expect.element(entry).toBeVisible()
    await expect.element(entry).toHaveTextContent('Trains vs. Run')
    await expect.element(entry).not.toHaveTextContent(/summary/i)
  })

  test('the Plots section names itself empty until a plot is opened', async () => {
    const store = setupStore()
    const { screen } = await renderNav(store)

    // With nothing open, the section says so
    await expect.element(screen.getByText('No plots')).toBeVisible()

    // Opening a plot puts its row where the placeholder was
    store.dispatch(addPlot(trains))

    await expect
      .element(screen.getByRole('link', { name: /^Trains vs. Run/ }))
      .toBeVisible()
    await expect.element(screen.getByText('No plots')).not.toBeInTheDocument()
  })

  test('the Table and Plots headers are labels that never switch the view', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen } = await renderNav(store)

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
      .element(screen.getByRole('link', { name: 'All runs', exact: true }))
      .toHaveAttribute('aria-current', 'page')
  })

  test('the nav foot names the user, and the rail keeps only their initials', async () => {
    await resizeViewport({ width: 1024, height: 768 })
    const store = setupStore()
    const { screen } = await renderNav(store, { user: ada })

    // Expanded, the foot shows the full name, the button named by it alone
    await expect
      .element(
        screen.getByRole('button', { name: 'Ada Lovelace', exact: true })
      )
      .toHaveTextContent('Ada Lovelace')

    // Folded to the rail, only the avatar is left, still named for the user
    store.dispatch(navCollapsed())
    await expect
      .element(
        screen.getByRole('button', { name: 'Ada Lovelace', exact: true })
      )
      .toHaveTextContent('AL')
    await expect
      .element(screen.getByText('Ada Lovelace'))
      .not.toBeInTheDocument()
  })
})

describe('picking a view', () => {
  test('All runs under Table links to the table', async () => {
    const store = setupStore()
    const { screen, router } = await renderNav(store, { url: CONTEXT_FILE })

    const allRuns = screen.getByRole('link', { name: 'All runs', exact: true })
    await allRuns.click()

    await expect.element(allRuns).toHaveAttribute('aria-current', 'page')
    expect(currentUrl(router)).toBe(TABLE)
  })
})

describe('making a plot', () => {
  test('the plus beside Plots opens the new plot dialog', async () => {
    const { screen } = await renderNav(setupStore())

    await screen.getByRole('button', { name: 'New plot' }).click()

    await expect
      .element(screen.getByRole('dialog', { name: 'New plot' }))
      .toBeVisible()
  })
})

describe('closing a plot', () => {
  test('the close mark shows only while its entry is hovered or focused', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    store.dispatch(addPlot(pulses))
    const { screen } = await renderNav(store)
    const marks = screen.getByRole('button', {
      name: /^Close /,
      includeHidden: true,
    })

    // Before any hover both marks are hidden, the shown plot's included
    await expect.element(marks.nth(0)).not.toBeVisible()
    await expect.element(marks.nth(1)).not.toBeVisible()

    // Hovering the Trains entry brings its mark out
    await screen.getByRole('link', { name: /^Trains vs. Run/ }).hover()
    await expect.element(marks.nth(0)).toBeVisible()

    // Tab from the Pulses entry lands on its mark
    const pulsesEntry = screen.getByRole('link', { name: /^Pulses vs. Run/ })
    const pulsesButton = pulsesEntry.element() as HTMLElement
    pulsesButton.focus()
    await userEvent.tab()
    await expect.element(marks.nth(1)).toHaveFocus()
    await expect.element(marks.nth(1)).toBeVisible()
  })

  test('the plot on show goes back to the view before it, and Back opens it again', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen, router } = await renderNav(store, { url: CONTEXT_FILE })
    const entry = screen.getByRole('link', { name: /^Trains vs. Run/ })

    // Show the plot, then close it
    await entry.click()
    await closePlot(screen, 'Trains vs. Run')
    await expect.element(entry).not.toBeInTheDocument()
    expect(currentUrl(router)).toBe(CONTEXT_FILE)

    // Back
    await router.navigate(-1)
    expect(currentUrl(router)).toBe(TRAINS)
  })

  test('the plot on show never goes back to a plot closed before it', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    store.dispatch(addPlot(pulses))
    const { screen, router } = await renderNav(store)
    const entry = (name: RegExp) => screen.getByRole('link', { name })

    // Show Trains, then Pulses, and close Pulses
    await entry(/^Trains vs. Run/).click()
    await entry(/^Pulses vs. Run/).click()
    await closePlot(screen, 'Pulses vs. Run')
    expect(currentUrl(router)).toBe(TRAINS)

    // Close Trains, the view before it being the closed Pulses
    await closePlot(screen, 'Trains vs. Run')
    expect(currentUrl(router)).toBe(TABLE)
  })

  test('a plot opened at another address of it never goes back to itself', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen, router } = await renderNav(store, {
      url: '/proposal/6996/plots/summary?y=n_trains&x=run&runs=1-3',
    })
    const entry = screen.getByRole('link', { name: /^Trains vs. Run/ })

    // Move to the plot's own address through its entry, then close it
    await entry.click()
    await closePlot(screen, 'Trains vs. Run')
    expect(currentUrl(router)).toBe(TABLE)
  })

  test('the plot on show never goes back to a plot link that drew no plot', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen, router } = await renderNav(store, { url: CONTEXT_FILE })
    const entry = screen.getByRole('link', { name: /^Trains vs. Run/ })

    // Open a plot link with no y variable, then show Trains
    await router.navigate('/proposal/6996/plots/summary?x=run')
    await entry.click()

    // Close Trains
    await closePlot(screen, 'Trains vs. Run')
    expect(currentUrl(router)).toBe(CONTEXT_FILE)
  })

  test('the plot on show never goes back to a link that points at no view', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen, router } = await renderNav(store, {
      url: '/proposal/6996/tabel',
    })

    // Show Trains, then close it
    await screen.getByRole('link', { name: /^Trains vs. Run/ }).click()
    await closePlot(screen, 'Trains vs. Run')
    expect(currentUrl(router)).toBe(TABLE)
  })

  test('a plot in the background leaves the view alone, and the view before it forgets it', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    store.dispatch(addPlot(pulses))
    const { screen, router } = await renderNav(store)
    const entry = (name: RegExp) => screen.getByRole('link', { name })

    // Show Trains, then Pulses, and close Trains behind it
    await entry(/^Trains vs. Run/).click()
    await entry(/^Pulses vs. Run/).click()
    await closePlot(screen, 'Trains vs. Run')
    expect(currentUrl(router)).toBe(PULSES)

    // Close Pulses
    await closePlot(screen, 'Pulses vs. Run')
    expect(currentUrl(router)).toBe(TABLE)
  })

  test('focus moves to the entry below, the one above, then New plot', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    store.dispatch(addPlot(pulses))
    store.dispatch(addPlot(intensity))
    const { screen } = await renderNav(store)
    const entry = (name: RegExp) => screen.getByRole('link', { name })

    // Close the middle plot from the keyboard
    const pulsesButton = entry(/^Pulses vs. Run/).element() as HTMLElement
    pulsesButton.focus()
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    await expect.element(entry(/^Intensity vs. Run/)).toHaveFocus()

    // Close the last plot
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    await expect.element(entry(/^Trains vs. Run/)).toHaveFocus()

    // Close the only plot left
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(screen.getByRole('button', { name: 'New plot' }))
      .toHaveFocus()
  })
})

describe('folding the nav to a rail', () => {
  // The rail only exists from the `sm` breakpoint up.
  beforeEach(() => resizeViewport({ width: 1024, height: 768 }))

  function renderRail(plots: ListedPlot[]) {
    const store = setupStore()
    for (const plot of plots) {
      store.dispatch(addPlot(plot))
    }
    store.dispatch(navCollapsed())

    return renderNav(store)
  }

  test('the rail lists the open plots and New plot in its popover', async () => {
    const { screen } = await renderRail([trains, pulses])

    await screen.getByRole('button', { name: 'Plots', exact: true }).click()

    await expect
      .element(screen.getByRole('link', { name: /^Trains vs. Run/ }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: /^Pulses vs. Run/ }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'New plot' }))
      .toBeVisible()
  })

  test('picking a plot in the rail shows it and closes the popover', async () => {
    const { screen, router } = await renderRail([trains])
    const plots = screen.getByRole('button', { name: 'Plots', exact: true })

    await plots.click()
    await screen.getByRole('link', { name: /^Trains vs. Run/ }).click()

    await expect
      .element(screen.getByRole('dialog', { name: 'Plots' }))
      .not.toBeInTheDocument()
    await expect.element(plots).toHaveAttribute('aria-current', 'page')
    expect(currentUrl(router)).toBe(TRAINS)
  })

  test('picking a plot or New plot in the rail hands focus back to Plots', async () => {
    const { screen } = await renderRail([trains])
    const plots = screen.getByRole('button', { name: 'Plots', exact: true })

    // Pick the plot from the keyboard
    await openRailPlots(screen)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    await expect.element(plots).toHaveFocus()

    // Open New plot from the keyboard, then close its dialog
    await openRailPlots(screen)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await userEvent.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'New plot' })
    await expect.element(dialog).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(plots).toHaveFocus()
  })

  test('the rail popover takes focus on open without showing a close mark', async () => {
    const { screen } = await renderRail([trains])

    await openRailPlots(screen)

    await expect
      .element(
        screen.getByRole('button', {
          name: /^Close Trains/,
          includeHidden: true,
        })
      )
      .not.toBeVisible()
  })

  test('Escape closes the rail popover and hands focus back to Plots', async () => {
    const { screen } = await renderRail([trains])

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
    const { screen } = await renderRail([trains])

    await openRailPlots(screen)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')

    await expect
      .element(screen.getByRole('button', { name: 'New plot' }))
      .toHaveFocus()
  })

  test('closing a plot in the rail keeps the popover open', async () => {
    const { screen } = await renderRail([trains, pulses])
    const plots = screen.getByRole('button', { name: 'Plots', exact: true })

    await plots.click()
    await closePlot(screen, 'Trains vs. Run')

    await expect.element(plots).toHaveAttribute('aria-expanded', 'true')
    await expect
      .element(screen.getByRole('link', { name: /^Trains vs. Run/ }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: /^Pulses vs. Run/ }))
      .toBeVisible()
  })

  test('closing the last plot in the rail popover hands focus to New plot', async () => {
    const { screen } = await renderRail([trains])

    await openRailPlots(screen)
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    await expect
      .element(screen.getByRole('button', { name: 'New plot' }))
      .toHaveFocus()
  })

  test('the rail popover stays inside a short window, its plots scrolling above New plot, which stays in full view', async () => {
    await resizeViewport({ width: 1024, height: 480 })
    const { screen } = await renderRail(
      Array.from({ length: 15 }, (_, i) => ({
        ...trains,
        runs: [String(i + 1)],
      }))
    )

    await screen.getByRole('button', { name: 'Plots', exact: true }).click()

    // New plot is in full view without scrolling
    const newPlot = screen.getByRole('button', { name: 'New plot' })
    await expect.element(newPlot).toBeInViewport({ ratio: 1 })

    // The last plot scrolls into view
    const lastPlot = screen.getByRole('link', {
      name: /^Trains vs. Run, .*Run 15$/,
    })
    const lastPlotItem = lastPlot.element() as HTMLElement
    lastPlotItem.scrollIntoView()
    await expect.element(lastPlot).toBeInViewport()
    await expect.element(newPlot).toBeInViewport({ ratio: 1 })
  })
})

// The nav alone draws nothing for its mobile state, which the shell reads from
// the store, so these assert the store.
describe('opening the nav on a phone', () => {
  test('picking a view closes the mobile nav, and closing the plot on show leaves it open', async () => {
    const store = setupStore()
    store.dispatch(addPlot(trains))
    const { screen, router } = await renderNav(store)
    const entry = screen.getByRole('link', { name: /^Trains vs. Run/ })
    const mobileOpened = () => store.getState().dashboard.nav.mobileOpened

    // Pick the plot with the nav open
    store.dispatch(mobileNavToggled())
    await entry.click()
    await expect.poll(mobileOpened).toBe(false)

    // Close it with the nav open, waiting for the move back to be recorded
    store.dispatch(mobileNavToggled())
    await closePlot(screen, 'Trains vs. Run')
    expect(currentUrl(router)).toBe(TABLE)
    await expect
      .poll(() => store.getState().dashboard.previousView)
      .toBeUndefined()
    expect(mobileOpened()).toBe(true)
  })

  test('below the sm breakpoint a collapsed nav still opens in full', async () => {
    const store = setupStore()
    store.dispatch(navCollapsed())
    const { screen } = await renderNav(store)

    await expect
      .element(screen.getByRole('link', { name: 'All runs', exact: true }))
      .toBeVisible()
  })
})
