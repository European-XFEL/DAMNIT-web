import type { ReactNode } from 'react'
import { Paper, Group, type PaperProps } from '@mantine/core'

export type StatusBarProps = {
  leftSection?: ReactNode
  rightSection?: ReactNode
} & Omit<PaperProps, 'children'>

export function StatusBar({
  leftSection,
  rightSection,
  ...paperProps
}: StatusBarProps) {
  return (
    <Paper
      radius={0}
      role="status"
      {...paperProps}
      style={{
        flex: 'none',
        height: 22,
        borderTop: '1px solid var(--app-shell-border-color)',
        display: 'flex',
        alignItems: 'center',
        paddingInline: 6,
        ...paperProps.style,
      }}
    >
      <Group
        gap={8}
        style={{ flex: 1, minWidth: 0 }}
        wrap="nowrap"
        align="center"
      >
        {leftSection}
      </Group>

      <Group gap={12} justify="flex-end" wrap="nowrap" align="center">
        {rightSection}
      </Group>
    </Paper>
  )
}

export default StatusBar
