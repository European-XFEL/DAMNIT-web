import { Group, ScrollArea, Text } from '@mantine/core'

import { type VariableError } from '../../../types'

export type ErrorTooltipState = { error: VariableError; x: number; y: number }

/**
 * Hover tooltip for cells of variables that failed to execute. Positioned
 * `fixed` against viewport coordinates, so it needs no positioned ancestor. It
 * is purely informational (`pointerEvents: none`) so it never intercepts the
 * mouse while scanning down a column of errors; see `useErrorTooltip` for the
 * copy-on-Ctrl+C behavior.
 */
export const ErrorTooltip = ({
  error,
  x,
  y,
  copied,
}: ErrorTooltipState & { copied: boolean }) => (
  <div
    style={{
      position: 'fixed',
      left: x,
      top: y + 4,
      transform: 'translateX(-50%)',
      zIndex: 100,
      maxWidth: 360,
      background: '#2b2b2b',
      color: '#fff',
      borderRadius: 6,
      padding: '8px 10px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      pointerEvents: 'none',
    }}
  >
    <Group justify="space-between" gap="md" wrap="nowrap" mb={4}>
      <Text size="xs" fw={700} c="orange.4">
        {error.cls}
      </Text>
      <Text size="xs" c={copied ? 'teal.4' : 'dimmed'}>
        {copied ? 'Copied' : 'Press ⌘/Ctrl+C to copy'}
      </Text>
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
