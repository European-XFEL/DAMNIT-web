import { useEffect, useState } from 'react'
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconBook, IconDatabase, IconRoute } from '@tabler/icons-react'
import type { HZDRSource } from '../types'

export function HZDRSourceHome() {
  const [sources, setSources] = useState<HZDRSource[]>([])

  useEffect(() => {
    const loadSources = () => {
      fetch('/metadata/hzdr/sources')
        .then((response) => response.json())
        .then(setSources)
        .catch((error) => {
          console.error('Failed to load HZDR sources', error)
        })
    }

    loadSources()
    const timer = window.setInterval(loadSources, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const shotTotal = sources.reduce(
    (total, source) => total + source.shots.length,
    0
  )

  return (
    <Stack gap="lg" py="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>DAMNIT! HZDR workspace</Title>
          <Text c="dimmed">
            Follow live source traffic into staged packages, context columns,
            trends, and HDF5 previews.
          </Text>
        </Stack>
        <Group gap="xs">
          <Badge variant="light">{sources.length} sources</Badge>
          <Badge variant="light">{shotTotal} shots</Badge>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Card withBorder radius={4} p="md">
          <Stack gap="xs">
            <Group gap="xs">
              <IconRoute size={18} />
              <Title order={4}>Watch the flow</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Watch the passive LaserData stream plus local Shotcounter and
              Watchdog events as they move through DAMNIT.
            </Text>
            <Button component="a" href="/flow-monitor" variant="light">
              Flow monitor
            </Button>
          </Stack>
        </Card>
        <Card withBorder radius={4} p="md">
          <Stack gap="xs">
            <Group gap="xs">
              <IconDatabase size={18} />
              <Title order={4}>Inspect sources</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Open the shot table, select numeric cells for trends, and preview
              context-rendered data.
            </Text>
            <Button
              component="a"
              href={sources[0] ? `/source/${sources[0].key}` : '/home'}
              variant="light"
              disabled={!sources[0]}
            >
              Open latest source
            </Button>
          </Stack>
        </Card>
        <Card withBorder radius={4} p="md">
          <Stack gap="xs">
            <Group gap="xs">
              <IconBook size={18} />
              <Title order={4}>Read the workflow</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Use the HZDR docs page for the local launcher, connections, and
              package boundaries.
            </Text>
            <Button component="a" href="/docs" variant="light">
              Documentation
            </Button>
          </Stack>
        </Card>
      </SimpleGrid>

      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={3}>Sources</Title>
          <Text size="sm" c="dimmed">
            DAMNIT folders currently visible to the HZDR provider.
          </Text>
        </Group>
        {sources.map((source) => (
          <Card key={source.key} withBorder radius={4} p="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Anchor href={`/source/${source.key}`} fw={600}>
                  {source.title}
                </Anchor>
                <Text size="sm" c="dimmed">
                  {source.metadata.facility ?? 'HZDR'} /{' '}
                  {source.metadata.instrument ?? source.key}
                </Text>
                <Text size="xs" c="dimmed">
                  DAMNIT folder: {source.damnit_path}
                </Text>
              </Stack>
              <Badge>{source.shots.length} shots</Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}
