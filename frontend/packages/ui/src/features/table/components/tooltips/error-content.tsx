import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  Text,
  Tooltip,
  rem,
} from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'

import { type CellError } from '#src/data/table/table-data.types'
import { errorText, errorVisuals } from '#src/features/table/utils/cells'

type ErrorContentProps = {
  error: CellError
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
    <Box maw={360} px={10} py={8} c="white">
      <Group justify="space-between" gap="md" wrap="nowrap" mb={4}>
        <div>
          <Text size="sm" fw={600} c={accent}>
            {title}
          </Text>
          <Text size="xxs" c="gray.5" ff="monospace">
            {error.cls}
          </Text>
        </div>
        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <IconCheck
                style={{ width: rem(16), height: rem(16) }}
                stroke={1.5}
                color="var(--mantine-color-teal-4)"
              />
            ) : (
              <IconCopy
                style={{ width: rem(16), height: rem(16) }}
                stroke={1.5}
              />
            )}
          </ActionIcon>
        </Tooltip>
      </Group>
      <ScrollArea.Autosize mah={200} type="auto">
        <Text size="xxs" ff="monospace" style={{ whiteSpace: 'pre-wrap' }}>
          {error.message}
        </Text>
      </ScrollArea.Autosize>
    </Box>
  )
}
