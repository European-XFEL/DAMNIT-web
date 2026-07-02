import { Group, Button } from '@mantine/core'
import { IconDatabase, IconRoute, IconSearch } from '@tabler/icons-react'
import { Header, Logo } from '@damnit-frontend/ui'

export function AppHeader() {
  return (
    <Header px={20}>
      <Group gap="md" wrap="nowrap">
        <Logo linkTo="/home" />
        <Button
          component="a"
          href="/home"
          variant="subtle"
          size="sm"
          leftSection={<IconSearch size={16} />}
        >
          Inspect sources
        </Button>
        <Button
          component="a"
          href="/flow-monitor"
          variant="subtle"
          size="sm"
          leftSection={<IconRoute size={16} />}
        >
          Flow monitor
        </Button>
        <Button
          component="a"
          href="/link-shot-records"
          variant="subtle"
          size="sm"
          leftSection={<IconDatabase size={16} />}
        >
          Link records
        </Button>
      </Group>
    </Header>
  )
}
