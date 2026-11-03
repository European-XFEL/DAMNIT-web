import type { ReactNode } from 'react'
import { Group, Button } from '@mantine/core'
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

function NavButton({
  to,
  icon,
  label,
}: {
  to: string
  icon: ReactNode
  label: string
}) {
  const { pathname } = useLocation()
  const active = pathname === to || pathname.startsWith(`${to}/`)
  return (
    <Button
      component={Link}
      to={to}
      variant={active ? 'light' : 'subtle'}
      size="sm"
      leftSection={icon}
    >
      {label}
    </Button>
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
        <Logo linkTo="/home" />
        <NavButton
          to="/home"
          icon={<IconSearch size={16} />}
          label="Inspect sources"
        />
        <NavButton
          to="/flow-monitor"
          icon={<IconRoute size={16} />}
          label="Flow monitor"
        />
        <NavButton
          to="/review-matches"
          icon={<IconListCheck size={16} />}
          label="Review matches"
        />
        <NavButton to="/docs" icon={<IconBook size={16} />} label="Docs" />
      </Group>
      <UserMenu userName={userName} onLogout={() => navigate('/logout')} />
    </Header>
  )
}
