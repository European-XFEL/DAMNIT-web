import React, { lazy, Suspense } from 'react'
import {
  AppShell,
  Burger,
  Button as MantineButton,
  ButtonProps as MantineButtonProps,
  CloseButton,
  ElementProps,
  Flex,
  Group,
  Skeleton,
  Stack,
  Tabs as MantineTabs,
  Text,
  Title,
  rem,
  ScrollArea,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import { IconGraph, IconX } from '@tabler/icons-react'
import cx from 'clsx'

import { Header, Logo } from '../../components/headers'
import { InstrumentBadge } from '../../components/badges'
import { Tabs, TabsProps } from '../../components/tabs'
import { useCurrentProposal } from '../../data/metadata'
import { VisibilitySettings } from '../visibility-settings'
import { useAppDispatch, useAppSelector } from '../../redux'
import { PlotDialog } from '../plots'
import { removeTab, setCurrentTab, closeAside } from './dashboard.slice'
import Run from './run'

import styles from './dashboard.module.css'
import headerStyles from '../../styles/header.module.css'

const PlotsTab = lazy(() =>
  import('../plots').then((module) => ({ default: module.PlotsTab }))
)
const ContextFileEditorTab = lazy(() =>
  import('../contextfileeditor').then((module) => ({
    default: module.ContextFileEditorTab,
  }))
)
const Table = lazy(() => import('../table'))

interface ButtonProps
  extends MantineButtonProps,
    ElementProps<'button', keyof MantineButtonProps> {
  label: string
  icon: React.ReactNode
  color?: string
}

const Button = ({ label, icon, color = 'indigo', ...props }: ButtonProps) => {
  return (
    <MantineButton
      color={color}
      variant="white"
      size="xs"
      style={{
        transition: 'color 0.5s ease, box-shadow 0.3s ease',
      }}
      {...props}
    >
      <Group gap={6} px={0}>
        {icon}
        <Text fw={500} size={rem(12)} lh={1} ml={3}>
          {label}
        </Text>
      </Group>
    </MantineButton>
  )
}

const MainTabs = ({ contents, active, setActive, ...props }: TabsProps) => {
  const [openedDialog, { open: openDialog, close: closeDialog }] =
    useDisclosure()

  const entries = Object.entries(contents)
  return (
    <>
      <MantineTabs
        value={active || entries[0][0]}
        onChange={setActive}
        classNames={{
          root: styles.tabs,
          list: cx(headerStyles.bottom, styles.tabsList),
          tab: styles.tab,
        }}
        variant="outline"
        visibleFrom="sm"
        pt={8}
        keepMounted={false}
        {...props}
      >
        <MantineTabs.List px={8}>
          {entries.map(([id, tab]) => (
            <MantineTabs.Tab
              value={id}
              key={`tabs-tab-${id}`}
              {...(tab.isClosable && tab.onClose
                ? {
                    rightSection: <IconX size={16} onClick={tab.onClose} />,
                  }
                : {})}
            >
              {tab.title}
            </MantineTabs.Tab>
          ))}
          <Button
            label="Display Plot"
            icon={
              <IconGraph
                style={{ width: rem(14), height: rem(14) }}
                stroke={1.5}
              />
            }
            ml="auto"
            onClick={openDialog}
          />
        </MantineTabs.List>
        {entries.map(([id, { element }]) => (
          <MantineTabs.Panel value={id} key={`tabs-panel-${id}`} pt="xs">
            <Flex
              direction="column"
              h="calc(100vh - 52px - var(--app-shell-header-height, 0px) - var(--app-shell-footer-height, 0px))"
            >
              {element}
            </Flex>
          </MantineTabs.Panel>
        ))}
      </MantineTabs>
      <PlotDialog opened={openedDialog} close={closeDialog} />
    </>
  )
}

const Dashboard = () => {
  const dispatch = useAppDispatch()
  const { main, aside } = useAppSelector((state) => state.dashboard)
  const { run: selectedRun } = useAppSelector((state) => state.table.selection)

  const [openedNavBar, { toggle: toggleNavBar }] = useDisclosure()

  // Proposal: Check if it is fully loaded (at least the metadata)
  const { proposal, isLoading } = useCurrentProposal()
  if (isLoading) {
    return
  }

  // Main tabs
  const mainTabElements = {
    table: (
      <Suspense fallback={<div>Loading...</div>}>
        <Table />
      </Suspense>
    ),
    plots: (
      <Suspense fallback={<div>Loading...</div>}>
        <PlotsTab />
      </Suspense>
    ),
    editor: (
      <Suspense fallback={<div>Loading...</div>}>
        <ContextFileEditorTab />
      </Suspense>
    ),
  }
  const populatedMainTabs = Object.fromEntries(
    Object.entries(main.tabs).map(([id, tab]) => [
      id,
      {
        element: mainTabElements[id as keyof typeof mainTabElements],
        ...tab,
        ...(tab.isClosable ? { onClose: () => dispatch(removeTab(id)) } : {}),
      },
    ])
  )

  // Aside tabs
  const populatedAsideTabs = Object.fromEntries(
    Object.entries(aside.tabs).map(([id, tab]) => {
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
        collapsed: { desktop: !openedNavBar },
      }}
      aside={{
        width: 360,
        breakpoint: 'sm',
        collapsed: { desktop: !aside.isOpened },
      }}
    >
      <AppShell.Header>
        <Header px={8}>
          <Group gap="sm" align="center">
            <Burger
              opened={openedNavBar}
              onClick={toggleNavBar}
              visibleFrom="sm"
              size="sm"
            />
            <Logo />
            <Stack gap={0}>
              <Flex gap={10} align="center">
                <InstrumentBadge instrument={proposal.instrument} />
                <Title order={5}>
                  {`p${proposal.number} - ${proposal.principal_investigator}`}
                </Title>
              </Flex>
              <Text size={rem(10)} c="dimmed" fs="italic">
                {proposal.title}
              </Text>
            </Stack>
          </Group>
        </Header>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <ScrollArea>
          <VisibilitySettings />
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <MainTabs
          contents={populatedMainTabs}
          active={main.currentTab}
          setActive={(id) => dispatch(setCurrentTab(id))}
        />
      </AppShell.Main>
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

export default Dashboard
