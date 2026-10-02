import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  Text,
  Tooltip,
  rem,
} from '@mantine/core'
import { useClipboard, useDidUpdate } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronsRight,
  IconCopy,
  IconHelp,
  type Icon,
} from '@tabler/icons-react'

import {
  errorKind,
  errorText,
  type CellError,
  type ErrorKind,
} from '#src/utils/cell-errors'

// The panel takes the theme's AA text colours. The tooltip draws on its own
// dark ground, so it brings shades that clear AA there.
const PALETTES = {
  tooltip: {
    error: 'red.4',
    muted: 'gray.4',
    cls: 'gray.5',
    message: 'white',
    copied: 'var(--mantine-color-teal-4)',
  },
  panel: {
    error: 'var(--mantine-color-error)',
    muted: 'dimmed',
    cls: 'dimmed',
    message: 'var(--mantine-color-text)',
    copied: 'var(--mantine-color-teal-8)',
  },
}

// The grid draws these glyphs from ERROR_ICON_PATHS in cells.ts.
const KINDS: Record<ErrorKind, { icon: Icon; title: string }> = {
  error: { icon: IconAlertTriangle, title: 'Error' },
  missing: { icon: IconHelp, title: 'Missing data' },
  skipped: { icon: IconChevronsRight, title: 'Missing dependency' },
}

const COPIED_RESET_MS = 1500

type CellErrorCardProps = {
  error: CellError
  variant: keyof typeof PALETTES
}

function CellErrorCard({ error, variant }: CellErrorCardProps) {
  const kind = errorKind(error.cls)
  const { icon: KindIcon, title } = KINDS[kind]
  const palette = PALETTES[variant]
  const clipboard = useClipboard({ timeout: COPIED_RESET_MS })

  useDidUpdate(clipboard.reset, [error])

  const message = (
    <Text size="xxs" ff="monospace" style={{ whiteSpace: 'pre-wrap' }}>
      {error.message}
    </Text>
  )

  const copyLabel = clipboard.error
    ? 'Copy failed'
    : clipboard.copied
      ? 'Copied'
      : 'Copy'
  const CopyIcon = clipboard.copied ? IconCheck : IconCopy

  return (
    <Box c={palette.message} style={{ overflowWrap: 'anywhere' }}>
      <Group justify="space-between" gap="md" wrap="nowrap" mb={4}>
        <div>
          <Group
            gap={6}
            wrap="nowrap"
            c={kind === 'error' ? palette.error : palette.muted}
          >
            <KindIcon
              aria-hidden
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.5}
            />
            <Text size="sm" fw={600}>
              {title}
            </Text>
          </Group>
          <Text size="xxs" c={palette.cls} ff="monospace">
            {error.cls}
          </Text>
        </div>
        <Tooltip label={copyLabel} withArrow>
          <ActionIcon
            aria-label={copyLabel}
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => {
              // Mantine 7 keeps a failed copy's error through a later
              // success; 9.6 clears it, and this reset can go then.
              if (clipboard.error) {
                clipboard.reset()
              }
              clipboard.copy(errorText(error))
            }}
          >
            <CopyIcon
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.5}
              color={clipboard.copied ? palette.copied : undefined}
            />
          </ActionIcon>
        </Tooltip>
      </Group>
      {variant === 'tooltip' ? (
        <ScrollArea.Autosize mah={200} type="auto">
          {message}
        </ScrollArea.Autosize>
      ) : (
        message
      )}
    </Box>
  )
}

export default CellErrorCard
