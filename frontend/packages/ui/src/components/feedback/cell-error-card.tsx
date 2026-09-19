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

import { errorText, errorVisuals, type CellError } from '#src/utils/cell-errors'

type CellErrorCardVariant = 'tooltip' | 'panel'

type CellErrorCardProps = {
  error: CellError
  variant: CellErrorCardVariant
}

// The tooltip draws on its dark ground and the panel on white; each palette
// clears AA on its own ground.
const PALETTES = {
  tooltip: {
    error: 'red.4',
    quiet: 'gray.4',
    cls: 'gray.5',
    message: 'white',
    copied: 'var(--mantine-color-teal-4)',
  },
  panel: {
    error: 'red.9',
    quiet: 'gray.7',
    cls: 'gray.7',
    message: 'gray.9',
    copied: 'var(--mantine-color-teal-8)',
  },
} satisfies Record<CellErrorCardVariant, Record<string, string>>

const COPIED_RESET_MS = 1500

function CellErrorCard({ error, variant }: CellErrorCardProps) {
  const { kind, title } = errorVisuals(error.cls)
  const palette = PALETTES[variant]
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

  const isTooltip = variant === 'tooltip'

  return (
    <Box
      maw={isTooltip ? 360 : undefined}
      px={isTooltip ? 10 : 0}
      py={isTooltip ? 8 : 0}
      c={palette.message}
    >
      <Group justify="space-between" gap="md" wrap="nowrap" mb={4}>
        <div>
          <Text
            size="sm"
            fw={600}
            c={kind === 'error' ? palette.error : palette.quiet}
          >
            {title}
          </Text>
          <Text size="xxs" c={palette.cls} ff="monospace">
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
                color={palette.copied}
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
      <ScrollArea.Autosize mah={isTooltip ? 200 : undefined} type="auto">
        <Text size="xxs" ff="monospace" style={{ whiteSpace: 'pre-wrap' }}>
          {error.message}
        </Text>
      </ScrollArea.Autosize>
    </Box>
  )
}

export default CellErrorCard
