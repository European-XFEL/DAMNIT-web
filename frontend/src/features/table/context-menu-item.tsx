import { Stack, Text } from '@mantine/core'

import {
  ContextMenuItem as MantineContextMenuItem,
  ContextMenuItemOptions as MantineContextMenuItemOptions,
} from 'mantine-contextmenu'

export type ContextMenuItemOptions = {
  title: string
  subtitle: string
} & MantineContextMenuItemOptions

const ContextMenuItem = ({
  title,
  subtitle,
  ...props
}: ContextMenuItemOptions) => {
  return (
    <MantineContextMenuItem
      title={
        <Stack gap={0}>
          <Text size="sm">{title}</Text>
          {subtitle && (
            <Text size="xs" c="dark.5">
              {subtitle}
            </Text>
          )}
        </Stack>
      }
      onHide={() => {
        /* override default onHide */
        return
      }}
      {...props}
    />
  )
}

export default ContextMenuItem
