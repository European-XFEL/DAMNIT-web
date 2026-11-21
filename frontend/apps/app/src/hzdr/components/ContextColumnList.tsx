import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import {
  IconArrowDown,
  IconArrowUp,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react'

import type { ContextVariableBlock } from '../types'

/**
 * The @Variable columns of a context file, in file (and table) order: edit
 * one in the builder, move it, or delete it after a confirm step.
 */
export function ContextColumnList({
  columns,
  selectedId,
  busy = false,
  onEdit,
  onStopEditing,
  onMove,
  onDelete,
}: {
  columns: ContextVariableBlock[]
  selectedId: string | null
  busy?: boolean
  onEdit: (id: string) => void
  onStopEditing: () => void
  onMove: (id: string, direction: -1 | 1) => void
  onDelete: (id: string) => void
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  if (!columns.length) {
    return (
      <Text size="xs" c="dimmed">
        This file has no columns yet.
      </Text>
    )
  }

  return (
    <Stack gap={4} component="ol" style={{ listStyle: 'none', padding: 0 }}>
      {columns.map((column, index) => {
        const editing = column.id === selectedId
        const confirming = column.id === confirmingId
        const label = column.title || column.name
        return (
          <Paper
            key={column.id}
            component="li"
            withBorder
            radius={4}
            px="sm"
            py={4}
            aria-label={`Column: ${label}`}
            bg={editing ? 'var(--mantine-color-blue-0)' : undefined}
          >
            <Group gap="xs" wrap="nowrap" justify="space-between">
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={600} truncate="end">
                    {index + 1}. {label}
                  </Text>
                  {editing ? (
                    <Badge size="xs" radius={4} variant="light">
                      Editing
                    </Badge>
                  ) : null}
                </Group>
                {column.title && column.title !== column.name ? (
                  <Text size="xs" c="dimmed" ff="monospace" truncate="end">
                    {column.name}
                  </Text>
                ) : null}
              </Stack>
              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                {editing ? (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={onStopEditing}
                  >
                    Stop editing
                  </Button>
                ) : (
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconPencil size={12} />}
                    onClick={() => onEdit(column.id)}
                    aria-label={`Edit ${label}`}
                  >
                    Edit
                  </Button>
                )}
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={`Move ${label} up`}
                  disabled={busy || index === 0}
                  onClick={() => onMove(column.id, -1)}
                >
                  <IconArrowUp size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={`Move ${label} down`}
                  disabled={busy || index === columns.length - 1}
                  onClick={() => onMove(column.id, 1)}
                >
                  <IconArrowDown size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label={`Delete ${label}`}
                  disabled={busy}
                  onClick={() => setConfirmingId(confirming ? null : column.id)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
            {confirming ? (
              <Group
                gap="xs"
                mt={4}
                justify="flex-end"
                role="group"
                aria-label={`Confirm deleting ${label}`}
              >
                <Text size="xs">Delete “{label}” from this file?</Text>
                <Button
                  size="compact-xs"
                  color="red"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingId(null)
                    onDelete(column.id)
                  }}
                >
                  Delete
                </Button>
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => setConfirmingId(null)}
                >
                  Cancel
                </Button>
              </Group>
            ) : null}
          </Paper>
        )
      })}
    </Stack>
  )
}
