import React, { useState } from "react"
import { useSelector } from "react-redux"
import { UnstyledButton, Group, Text, Menu, Burger, rem } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { IconLogout, IconChevronDown } from "@tabler/icons-react"
import cx from "clsx"

import { selectUserFullName } from "../../features/auth"
import { history } from "../../routes"

import styles from "./Header.module.css"
import headerStyles from "../../styles/header.module.css"

const UserMenu = () => {
  const [userMenuOpened, setUserMenuOpened] = useState(false)
  const userFullName = useSelector(selectUserFullName)

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
          className={cx(styles.user, {
            [styles.userActive]: userMenuOpened,
          })}
        >
          <Group gap={7}>
            <Text fw={500} size="sm" lh={1} mr={3}>
              {userFullName}
            </Text>
            <IconChevronDown
              style={{ width: rem(12), height: rem(12) }}
              stroke={1.5}
            />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={() => history.navigate("/logout")}
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

const Header = ({ children }) => {
  const [opened, { toggle }] = useDisclosure(false)
  return (
    <Group
      h="100%"
      w="100%"
      className={headerStyles.body}
      justify="space-between"
      align="center"
      px={20}
    >
      {children}
      <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
      <UserMenu />
    </Group>
  )
}

export default Header
