import React, { useState } from "react"
import {
  Container,
  UnstyledButton,
  Group,
  Text,
  Menu,
  Burger,
  rem,
  useMantineTheme,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { IconLogout, IconChevronDown } from "@tabler/icons-react"
import cx from "clsx"

import classes from "./Header.module.css"

const user = {
  name: "Cammille Carinan",
  email: "janspoon@fighter.dev",
}

const UserMenu = () => {
  const theme = useMantineTheme()
  const [userMenuOpened, setUserMenuOpened] = useState(false)

  return (
    <Menu
      width={260}
      position="bottom-end"
      transitionProps={{ transition: "pop-top-right" }}
      onClose={() => setUserMenuOpened(false)}
      onOpen={() => setUserMenuOpened(true)}
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton
          className={cx(classes.user, {
            [classes.userActive]: userMenuOpened,
          })}
        >
          <Group gap={7}>
            <Text fw={500} size="sm" lh={1} mr={3}>
              {user.name}
            </Text>
            <IconChevronDown
              style={{ width: rem(12), height: rem(12) }}
              stroke={1.5}
            />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Settings</Menu.Label>

        <Menu.Item
          leftSection={
            <IconLogout
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.5}
            />
          }
        >
          Logout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

const Header = ({ standalone = false }) => {
  const [opened, { toggle }] = useDisclosure(false)
  const component = (
    <Container className={classes.mainSection} size="lg">
      <Group justify="space-between">
        <Text size="xl" fw={700}>
          DAMNIT!
        </Text>
        <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
        <UserMenu />
      </Group>
    </Container>
  )

  return standalone ? (
    <div className={classes.header}>{component}</div>
  ) : (
    component
  )
}

export default Header
