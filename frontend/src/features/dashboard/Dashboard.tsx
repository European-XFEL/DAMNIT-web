import React from "react"
import { connect, useSelector } from "react-redux"
import { Flex, Group, Stack, Tabs, Text, Title, rem } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import cx from "clsx"

import { Header, Logo } from "../../common/header"
import { InstrumentBadge } from "../../common/badges"
import Table from "../table"
import { PlotsTab } from "../plots"
import { removeTab, setCurrentTab } from "./dashboardSlice"

import styles from "./Dashboard.module.css"
import headerStyles from "../../styles/header.module.css"

import { getProposal } from "../../utils/api/proposals"

const COMPONENTS_MAP = {
  table: <Table />,
  plots: <PlotsTab />,
}

const getTabs = ({ contents, active, setActive, ...props }) => {
  const entries = Object.entries(contents)
  return (
    <Tabs
      value={active || entries[0][0]}
      onChange={setActive}
      classNames={{
        root: styles.tabs,
        list: styles.tabsList,
        tab: styles.tab,
      }}
      variant="outline"
      visibleFrom="sm"
      {...props}
    >
      <Tabs.List
        className={cx(headerStyles.body, headerStyles.bottom, styles.tabsList)}
        pl={30}
        pr={30}
      >
        {entries.map(([id, tab]) => (
          <Tabs.Tab
            value={id}
            key={`tabs-tab-${id}`}
            {...(tab.isClosable && tab.onClose
              ? {
                  rightSection: <IconX size={16} onClick={tab.onClose} />,
                }
              : {})}
          >
            {tab.title}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {entries.map(([id, { element }]) => (
        <Tabs.Panel value={id} key={`tabs-panel-${id}`} pt="xs">
          <Stack>{element}</Stack>
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}

const Dashboard = ({ contents, currentTab, removeTab, setCurrentTab }) => {
  const proposal_number = useSelector((state) => state.proposal.current.value)
  const proposal = getProposal(proposal_number)

  if (!proposal) {
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
    <>
      <Header standalone={false} size="xxl">
        <Group gap="md">
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
      {getTabs({
        contents: Object.fromEntries(populated),
        active: currentTab,
        setActive: setCurrentTab,
      })}
    </>
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