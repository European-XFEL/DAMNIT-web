import {
  Avatar,
  UnstyledButton,
  Group,
  Text,
  Menu,
  rem,
  type MenuProps,
} from '@mantine/core'
import { IconLogout, IconMail, IconChevronDown } from '@tabler/icons-react'

import { CONTACT_EMAIL } from '#src/constants'

import classes from './user-menu.module.css'

// `header` sits at the right of a page header, `nav` at the foot of the
// dashboard's nav, and `rail` in the collapsed nav, where only initials fit.
type UserMenuVariant = 'header' | 'nav' | 'rail'

type UserMenuProps = {
  userName?: string
  onLogout: () => void
  variant?: UserMenuVariant
}

// A menu opens 4 px off its button, closer than Mantine's 8. The nav's keeps
// the 8, which lands its bottom edge on the foot's divider.
const OFFSETS: Record<UserMenuVariant, number> = {
  header: 4,
  nav: 8,
  rail: 4,
}

const POSITIONS: Record<UserMenuVariant, MenuProps['position']> = {
  header: 'bottom-end',
  nav: 'top-start',
  rail: 'right-end',
}

export function UserMenu({
  userName,
  onLogout,
  variant = 'header',
}: UserMenuProps) {
  if (!userName) {
    return null
  }

  // Hidden from screen readers, which would spell the initials before the name.
  const avatar = (
    <Avatar
      name={userName}
      size={26}
      classNames={{ placeholder: classes.avatar }}
      aria-hidden
    />
  )

  const chevron = (
    <IconChevronDown style={{ width: rem(14), height: rem(14) }} stroke={2} />
  )

  return (
    <Menu
      width={260}
      position={POSITIONS[variant]}
      offset={OFFSETS[variant]}
      transitionProps={{
        transition: variant === 'header' ? 'pop-top-right' : 'pop',
      }}
      withinPortal
    >
      <Menu.Target>
        {variant === 'rail' ? (
          <UnstyledButton className={classes.userRail} aria-label={userName}>
            {avatar}
          </UnstyledButton>
        ) : variant === 'nav' ? (
          <UnstyledButton className={classes.userNav}>
            {avatar}
            <Text truncate className={classes.userNavName} fw={500} size="sm">
              {userName}
            </Text>
            {chevron}
          </UnstyledButton>
        ) : (
          <UnstyledButton className={classes.user} p={5}>
            <Group gap={8} px={0}>
              {avatar}
              <Text fw={500} size="sm" c="black">
                {userName}
              </Text>
              {chevron}
            </Group>
          </UnstyledButton>
        )}
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
