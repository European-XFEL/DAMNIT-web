import { Container, Tabs } from "@mantine/core"

import classes from "./Navigation.module.css"
import Header from "../header/"

const tabs = [
  "Home",
  "Orders",
  "Education",
  "Community",
  "Forums",
  "Support",
  "Account",
  "Helpdesk",
]

const NavigationTabs = () => {
  const items = tabs.map((tab) => (
    <Tabs.Tab value={tab} key={tab}>
      {tab}
    </Tabs.Tab>
  ))

  return (
    <Container size="md">
      <Tabs
        defaultValue="Home"
        variant="outline"
        visibleFrom="sm"
        classNames={{
          root: classes.tabs,
          list: classes.tabsList,
          tab: classes.tab,
        }}
      >
        <Tabs.List>{items}</Tabs.List>
      </Tabs>
    </Container>
  )
}

const Navigation = () => {
  return (
    <div className={classes.header}>
      <Header standalone={false} />
      <NavigationTabs />
    </div>
  )
}

export default Navigation
