import React from "react"
import { connect } from "react-redux"
import { Group, Stack, Tabs, Text, rem } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import cx from "clsx"

import Header from "../../common/header"
import Table from "../table"
import { PlotsTab } from "../plots"
import { removeTab, setCurrentTab } from "./dashboardSlice"

import styles from "./Dashboard.module.css"
import headerStyles from "../../styles/header.module.css"

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
          <Text size={rem(28)} fw={700}>
            DAMNIT!
          </Text>
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