import React from "react"
import { connect } from "react-redux"
import {
  AppShell,
  Burger,
  Flex,
  Group,
  ScrollArea,
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
import { useCurrentProposal } from "../../hooks"
import Table from "../table"
import { PlotsTab } from "../plots"
import { removeTab, setCurrentTab } from "./dashboardSlice"

import styles from "./Dashboard.module.css"
import headerStyles from "../../styles/header.module.css"

const COMPONENTS_MAP = {
  table: <Table />,
  plots: <PlotsTab />,
}

const Tabs = ({ contents, active, setActive, ...props }) => {
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
      {entries.map(([id, { element }]) => (
        <MantineTabs.Panel value={id} key={`tabs-panel-${id}`} pt="xs">
          <Flex direction="column" h="80vh">
            <div style={{ width: "100%", height: "100%", flexGrow: 1 }}>
              {element}
            </div>
          </Flex>
        </MantineTabs.Panel>
      ))}
    </MantineTabs>
  )
}

const Dashboard = ({ contents, currentTab, removeTab, setCurrentTab }) => {
  const [openedNavBar, { toggle: toggleNavBar }] = useDisclosure()
  const [openedAside, { toggle: toggleAside }] = useDisclosure()
  const [disabled, { toggle: toggleDisabled }] = useDisclosure()

  const { proposal, isLoading } = useCurrentProposal()

  if (isLoading) {
    return
  }

  const populated = Object.entries(contents).map(([id, tab]) => [
    id,
    {
      ...tab,
      element: COMPONENTS_MAP[id] || <div>{tab.title}</div>,
      ...(tab.isClosable ? { onClose: () => removeTab(id) } : {}),
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
        width: 300,
        breakpoint: "md",
        collapsed: { desktop: !openedAside },
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
        <ScrollArea h="calc(100vh - var(--app-shell-header-height, 0px) - var(--app-shell-footer-height, 0px))">
          <Tabs
            py={8}
            contents={Object.fromEntries(populated)}
            active={currentTab}
            setActive={setCurrentTab}
          />
        </ScrollArea>
      </AppShell.Main>
    </AppShell>
  )
}

const mapStateToProps = ({ dashboard }) => {
  return {
    contents: dashboard.tabs,
    currentTab: dashboard.currentTab,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    removeTab: (id) => dispatch(removeTab(id)),
    setCurrentTab: (id) => {
      dispatch(setCurrentTab(id))
    },
    dispatch,
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Dashboard)
