import { useState } from 'react'
import { UnstyledButton, Group, Text, Menu, rem } from '@mantine/core'
import { IconLogout, IconMail, IconChevronDown } from '@tabler/icons-react'
import cx from 'clsx'

import { CONTACT_EMAIL } from '../../constants'

import classes from './header.module.css'

type UserMenuProps = {
  userName?: string
  onLogout: () => void
}

export function UserMenu({ userName, onLogout }: UserMenuProps) {
  const [opened, setOpened] = useState(false)

  if (!userName) {
    return null
  }

  return (
    <Menu
      width={260}
      position="bottom-end"
      transitionProps={{ transition: 'pop-top-right' }}
      onClose={() => setOpened(false)}
      onOpen={() => setOpened(true)}
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton
          className={cx(classes.user, { [classes.userActive]: opened })}
          p={5}
        >
          <Group gap={8} px={0}>
            <Text fw={500} size="sm" lh={1} mr={3}>
              {userName}
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
          component="a"
          href={`mailto:${CONTACT_EMAIL}`}
          leftSection={
            <IconMail
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.5}
            />
          }
        >
          Send feedback
        </Menu.Item>
        <Menu.Item
          onClick={onLogout}
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
