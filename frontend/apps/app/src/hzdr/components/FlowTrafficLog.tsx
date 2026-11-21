import {
  Badge,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
} from '@mantine/core'

import type { FlowTrafficEntry } from '../utils/flow-mode'

const TONE_COLORS: Record<FlowTrafficEntry['tone'], string> = {
  send: 'orange',
  stage: 'indigo',
  receive: 'teal',
}

/** Full-width log of what moved: newest first, scrolls past a few rows. */
export function FlowTrafficLog({
  entries,
  emptyText,
}: {
  entries: FlowTrafficEntry[]
  emptyText: string
}) {
  return (
    <Paper withBorder radius={4} p="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={700}>Traffic log</Text>
          <Text size="xs" c="dimmed">
            Newest first
          </Text>
        </Group>
        {entries.length ? (
          <ScrollArea.Autosize mah={320} type="auto">
            <Table.ScrollContainer minWidth={560}>
              <Table striped highlightOnHover verticalSpacing={4} stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th>Source</Table.Th>
                    <Table.Th>What happened</Table.Th>
                    <Table.Th>Shot</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {entries.map((entry) => (
                    <Table.Tr key={entry.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <Text size="xs" c="dimmed">
                          {entry.at}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <Badge
                          size="sm"
                          variant="light"
                          color={TONE_COLORS[entry.tone]}
                        >
                          {entry.source}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {entry.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {entry.detail}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{entry.shot ?? '—'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </ScrollArea.Autosize>
        ) : (
          <Text size="sm" c="dimmed">
            {emptyText}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}
