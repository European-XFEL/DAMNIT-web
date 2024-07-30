import React from "react"
import { useDispatch, useSelector } from "react-redux"
import {
  AppShell,
  Burger,
  CloseButton,
  Flex,
  Group,
  Skeleton,
  Stack,
  Tabs as MantineTabs,
  Text,
  Title,
  rem,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"

import { IconX } from "@tabler/icons-react"
import cx from "clsx"

import { Header, Logo } from "../../components/header"
import { InstrumentBadge } from "../../components/badges"
import { Tabs } from "../../components/tabs/"
import { useCurrentProposal } from "../../hooks"
import Table from "../table"
import { PlotsTab } from "../plots"
import { removeTab, setCurrentTab, closeAside } from "./dashboardSlice"
import Run from "./Run"

import styles from "./Dashboard.module.css"
import headerStyles from "../../styles/header.module.css"

const MainTabs = ({ contents, active, setActive, ...props }) => {
  const entries = Object.entries(contents)
  return (
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
      {...props}
    >
      <MantineTabs.List pl={30} pr={30}>
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
      </MantineTabs.List>
      {entries.map(([id, { Component, props }]) => (
        <MantineTabs.Panel value={id} key={`tabs-panel-${id}`} pt="xs">
          <Flex
            direction="column"
            h="calc(100vh - 56px - var(--app-shell-header-height, 0px) - var(--app-shell-footer-height, 0px))"
          >
            <Component {...props} />
          </Flex>
        </MantineTabs.Panel>
      ))}
    </MantineTabs>
  )
}

const Dashboard = () => {
  const dispatch = useDispatch()
  const { main, aside } = useSelector((state) => state.dashboard)

  const [openedNavBar, { toggle: toggleNavBar }] = useDisclosure()
  const [disabled, { toggle: toggleDisabled }] = useDisclosure()

  // Proposal: Check if it is fully loaded (at least the metadata)
  const { proposal, isLoading } = useCurrentProposal()
  if (isLoading) {
    return
  }

  // Main tabs
  const mainTabs = {
    table: {
      Component: Table,
      props: {},
    },
    plots: {
      Component: PlotsTab,
      props: {},
    },
  }
  const populatedMainTabs = Object.entries(main.tabs).map(([id, tab]) => [
    id,
    {
      ...tab,
      ...mainTabs[id],
      ...(tab.isClosable ? { onClose: () => dispatch(removeTab(id)) } : {}),
    },
  ])

  // Aside tabs
  const populatedAsideTabs = Object.entries(aside.tabs).map(([id, tab]) => [
    id,
    {
      ...tab,
      element: <Run />,
    },
  ])

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { desktop: !openedNavBar },
      }}
      aside={{
        width: 360,
        breakpoint: "md",
        collapsed: { desktop: !aside.isOpened },
      }}
    >
      <AppShell.Header>
        <Header px={8}>
          <Group gap="sm">
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
        {Array(15)
          .fill(0)
          .map((_, index) => (
            <Skeleton key={index} h={28} mt="sm" animate={false} />
          ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <MainTabs
          py={8}
          contents={Object.fromEntries(populatedMainTabs)}
          active={main.currentTab}
          setActive={(id) => dispatch(setCurrentTab(id))}
        />
      </AppShell.Main>
      <AppShell.Aside p="md">
        <Tabs
          contents={Object.fromEntries(populatedAsideTabs)}
          lastElement={
            <CloseButton ml="auto" onClick={() => dispatch(closeAside())} />
          }
        />
      </AppShell.Aside>
    </AppShell>
  )
}

export default Dashboard
