import { type ReactNode } from 'react'
import { AppShell, CloseButton, ScrollArea } from '@mantine/core'

import { Tabs } from '../../components/tabs'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { closeAside } from './dashboard.slice'
import Run from './run'

import { Settings } from '../settings'

type DashboardBaseProps = {
  main: ReactNode
  header?: ReactNode
}

const DashboardBase = ({ main, header }: DashboardBaseProps) => {
  const dispatch = useAppDispatch()
  const dashboard = useAppSelector((state) => state.dashboard)
  const { run: selectedRun } = useAppSelector((state) => state.table.selection)

  // Aside tabs
  const populatedAsideTabs = Object.fromEntries(
    Object.entries(dashboard.aside.tabs).map(([id, tab]) => {
      const extraProps = selectedRun
        ? { title: `${tab.title}: ${selectedRun}` }
        : {}
      return [
        id,
        {
          ...tab,
          ...extraProps,
          element: <Run />,
        },
      ]
    })
  )

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { desktop: !dashboard.nav.isOpened },
      }}
      aside={{
        width: 360,
        breakpoint: 'sm',
        collapsed: { desktop: !dashboard.aside.isOpened },
      }}
    >
      <AppShell.Header>{header}</AppShell.Header>
      <AppShell.Navbar p="md">
        <ScrollArea>
          <Settings />
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>{main}</AppShell.Main>
      <AppShell.Aside p="xs">
        <Tabs
          contents={populatedAsideTabs}
          lastElement={
            <CloseButton ml="auto" onClick={() => dispatch(closeAside())} />
          }
        />
      </AppShell.Aside>
    </AppShell>
  )
}

export default DashboardBase
