import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Group, ScrollArea, Text, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'

import { type VariableError } from '#src/types'
import { errorText, errorVisuals } from '#src/features/table/cells'

type ErrorContentProps = {
  error: VariableError
}

const COPIED_RESET_MS = 1500

export function ErrorContent({ error }: ErrorContentProps) {
  const { kind, title } = errorVisuals(error.cls)
  const accent = kind === 'error' ? 'red.4' : 'gray.4'
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number>(0)

  useEffect(() => {
    window.clearTimeout(resetTimerRef.current)
    setCopied(false)
    return () => {
      window.clearTimeout(resetTimerRef.current)
    }
  }, [error])

  const handleCopy = () => {
    void navigator.clipboard.writeText(errorText(error)).then(() => {
      setCopied(true)
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(
        () => setCopied(false),
        COPIED_RESET_MS
      )
    })
  }

  return (
    <div
      style={{
        maxWidth: 360,
        padding: '8px 10px',
        color: 'var(--mantine-color-white)',
      }}
    >
      <Group justify="space-between" gap="md" wrap="nowrap" mb={4}>
        <div>
          <Text size="xs" fw={700} c={accent}>
            {title}
          </Text>
          <Text size="xs" c="gray.5" style={{ fontFamily: 'monospace' }}>
            {error.cls}
          </Text>
        </div>
        <Tooltip
          label={copied ? 'Copied' : 'Copy'}
          withArrow
          styles={{ tooltip: { fontSize: 10, padding: '2px 6px' } }}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <IconCheck size={14} color="var(--mantine-color-teal-4)" />
            ) : (
              <IconCopy size={14} />
            )}
          </ActionIcon>
        </Tooltip>
      </Group>
      <ScrollArea.Autosize mah={200} type="auto">
        <Text
          size="xs"
          style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
        >
          {error.message}
        </Text>
      </ScrollArea.Autosize>
    </div>
  )
}
