import type { ReactNode } from 'react'
import { Paper, Group, type PaperProps } from '@mantine/core'

export type StatusBarProps = {
  leftSection?: ReactNode
  rightSection?: ReactNode
  height?: number
  zIndex?: number
} & Omit<PaperProps, 'children'>

export function StatusBar({
  leftSection,
  rightSection,
  height = 22,
  zIndex = 1000,
  ...paperProps
}: StatusBarProps) {
  return (
    <Paper
      withBorder
      radius={0}
      shadow="xs"
      role="status"
      {...paperProps}
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        height,
        zIndex,
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
