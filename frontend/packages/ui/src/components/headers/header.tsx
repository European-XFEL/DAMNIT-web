import { type PropsWithChildren, useState } from 'react'
import { UnstyledButton, Group, Text, Menu, rem } from '@mantine/core'
import { IconLogout, IconChevronDown } from '@tabler/icons-react'
import cx from 'clsx'

import { selectUserFullName } from '../../auth'
import { useAppSelector } from '../../redux/hooks'
import { history } from '../../routes'

import classes from './header.module.css'
import headerClasses from '../../styles/header.module.css'

const UserMenu = () => {
  const [userMenuOpened, setUserMenuOpened] = useState(false)
  const userFullName = useAppSelector(selectUserFullName)

  return (
    <Menu
      width={260}
      position="bottom-end"
      transitionProps={{ transition: 'pop-top-right' }}
      onClose={() => setUserMenuOpened(false)}
      onOpen={() => setUserMenuOpened(true)}
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton
          className={cx(classes.user, {
            [classes.userActive]: userMenuOpened,
          })}
          p={5}
        >
          <Group gap={8} px={0}>
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
          onClick={() => history.navigate('/logout')}
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

type HeaderProps = {
  px: number
}

const Header = ({ children, ...props }: PropsWithChildren<HeaderProps>) => {
  return (
    <Group
      h="100%"
      w="100%"
      className={headerClasses.body}
      justify="space-between"
      align="center"
      {...props}
    >
      {children}
      <UserMenu />
    </Group>
  )
}

export default Header
