import { type ReactNode } from 'react'
import {
  AppShell,
  CloseButton,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  rem,
} from '@mantine/core'
import {
  IconGraph,
  IconSourceCode,
  IconTable,
  type IconProps,
} from '@tabler/icons-react'

import { Tabs } from '../../components/tabs'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import {
  closeAside,
  setMainView,
  DEFAULT_MAIN_VIEWS,
  type MainContent,
} from './dashboard.slice'
import Run from './run'

const MAIN_CONTENT_ICONS: Record<
  MainContent['kind'],
  React.ComponentType<IconProps>
> = {
  table: IconTable,
  contextFile: IconSourceCode,
  plots: IconGraph,
}

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
      styles={{
        main: {
          paddingTop: `calc(var(--app-shell-header-offset, 0px) + ${rem(6)})`,
        },
      }}
    >
      <AppShell.Header>{header}</AppShell.Header>
      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="xs">
            {[...DEFAULT_MAIN_VIEWS.values()].map((view) => {
              const isActive = view.id === dashboard.main.view.id
              const Icon = MAIN_CONTENT_ICONS[view.content.kind]

              return (
                <NavLink
                  key={view.id}
                  label={<Text fw={isActive ? 600 : 400}>{view.title}</Text>}
                  active={isActive}
                  onClick={() => {
                    dispatch(setMainView(view.id))
                  }}
                  leftSection={
                    <Icon size={16} stroke={isActive ? 2.25 : 1.5} />
                  }
                  color="gray"
                  c="black"
                />
              )
            })}
          </Stack>
        </AppShell.Section>
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
