import React, { useState } from "react"
import { useSelector } from "react-redux"
import {
  Container,
  UnstyledButton,
  Group,
  Text,
  Menu,
  Burger,
  rem,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { IconLogout, IconChevronDown } from "@tabler/icons-react"
import cx from "clsx"

import styles from "./Header.module.css"
import headerStyles from "../../styles/header.module.css"

const UserMenu = () => {
  const [userMenuOpened, setUserMenuOpened] = useState(false)
  const { user: authUser } = useSelector((state) => state.auth)

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
              {authUser.name}
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

const Header = ({ standalone = false, size = "xl", children }) => {
  const [opened, { toggle }] = useDisclosure(false)
  const component = (
    <Container className={styles.mainSection} size={size}>
      <Group justify="space-between">
        {children}
        <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
        <UserMenu />
      </Group>
    </Container>
  )

  return (
    <div
      className={cx(headerStyles.body, headerStyles.top, {
        [headerStyles.bottom]: standalone,
      })}
    >
      {component}
    </div>
  )
}

export default Header
