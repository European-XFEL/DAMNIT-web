import type { ReactNode } from 'react'
import { Group, Button } from '@mantine/core'
import {
  IconBook,
  IconDatabase,
  IconRoute,
  IconSearch,
} from '@tabler/icons-react'
import { Link, useLocation } from 'react-router'
import { Header, Logo } from '@damnit-frontend/ui'

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
          to="/link-shot-records"
          icon={<IconDatabase size={16} />}
          label="Link records"
        />
        <NavButton to="/docs" icon={<IconBook size={16} />} label="Docs" />
      </Group>
    </Header>
  )
}
