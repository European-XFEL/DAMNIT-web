import type { ReactNode } from 'react'
import { Burger, Button, Group, Menu } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconBook,
  IconListCheck,
  IconRoute,
  IconSearch,
} from '@tabler/icons-react'
import { Link, useLocation, useNavigate } from 'react-router'

import {
  Header,
  Logo,
  UserMenu,
  selectUserFullName,
  useAppSelector,
} from '@damnit-frontend/ui'

import { VersionMismatch } from './VersionMismatch'

type NavTab = { to: string; icon: ReactNode; label: string }

/** The header's tabs, in order; desktop and the phone menu share them. */
const NAV_TABS: NavTab[] = [
  { to: '/home', icon: <IconSearch size={16} />, label: 'Campaigns' },
  { to: '/flow-monitor', icon: <IconRoute size={16} />, label: 'Flow monitor' },
  {
    to: '/review-matches',
    icon: <IconListCheck size={16} />,
    label: 'Review matches',
  },
  { to: '/docs', icon: <IconBook size={16} />, label: 'Docs' },
]

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function NavButton({ to, icon, label }: NavTab) {
  const { pathname } = useLocation()
  const active = isActive(pathname, to)
  return (
    <Button
      component={Link}
      to={to}
      variant={active ? 'light' : 'subtle'}
      size="sm"
      leftSection={icon}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Button>
  )
}

/** Below sm (768 px) the tabs fold into a menu behind a burger. */
function NavMenu() {
  const { pathname } = useLocation()
  const [opened, { open, close }] = useDisclosure(false)
  return (
    <Menu
      opened={opened}
      onChange={(value) => (value ? open() : close())}
      position="bottom-start"
      width={220}
    >
      <Menu.Target>
        <Burger
          opened={opened}
          size="sm"
          aria-label={opened ? 'Close navigation' : 'Open navigation'}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {NAV_TABS.map((tab) => {
          const active = isActive(pathname, tab.to)
          return (
            <Menu.Item
              key={tab.to}
              component={Link}
              to={tab.to}
              leftSection={tab.icon}
              color={active ? 'blue' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Menu.Item>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}

export function AppHeader() {
  // Upstream's Header is presentational since the 2026-11 merge: a page passes
  // the user menu in itself, as its own routes do.
  const userName = useAppSelector(selectUserFullName)
  const navigate = useNavigate()

  return (
    <Header px={20}>
      <Group gap="md" wrap="nowrap">
        <Group hiddenFrom="sm" gap="xs" wrap="nowrap">
          <NavMenu />
        </Group>
        <Logo linkTo="/home" />
        <Group gap="md" wrap="nowrap" visibleFrom="sm">
          {NAV_TABS.map((tab) => (
            <NavButton key={tab.to} {...tab} />
          ))}
        </Group>
      </Group>
      <Group gap="sm" wrap="nowrap">
        <VersionMismatch />
        <UserMenu userName={userName} onLogout={() => navigate('/logout')} />
      </Group>
    </Header>
  )
}
