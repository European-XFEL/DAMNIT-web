import { Group, Stack, Text } from '@mantine/core'
import {
  ContextMenuItem as MantineContextMenuItem,
  type ContextMenuItemOptions as MantineContextMenuItemOptions,
} from 'mantine-contextmenu'

import PlotKindIcon from '#src/components/icons/plot-kind-icon'
import { type PlotSource } from '#src/types'

import classes from './context-menu-item.module.css'

export type ContextMenuItemOptions = {
  kind: PlotSource
  title: string
  subtitle: string
} & MantineContextMenuItemOptions

// The icon sits in the title rather than the library's icon slot, which nudges
// it 2 px up to centre on a single line.
const ContextMenuItem = ({
  kind,
  title,
  subtitle,
  ...props
}: ContextMenuItemOptions) => {
  return (
    <MantineContextMenuItem
      className={classes.item}
      title={
        <Group gap={6} wrap="nowrap" align="flex-start">
          <span className={classes.icon}>
            <PlotKindIcon kind={kind} size={16} />
          </span>
          <Stack gap={0}>
            <Text size="xs">{title}</Text>
            {subtitle && (
              <Text size="xxs" c="gray.7">
                {subtitle}
              </Text>
            )}
          </Stack>
        </Group>
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
