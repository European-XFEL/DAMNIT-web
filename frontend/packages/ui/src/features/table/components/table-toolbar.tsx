import { memo } from 'react'
import { ActionIcon, Divider, Group, Tooltip, rem } from '@mantine/core'
import { IconArrowAutofitWidth, IconRestore } from '@tabler/icons-react'

import { TagsPopover } from '#src/features/table/components/popovers/tags-popover'
import { VariablesPopover } from '#src/features/table/components/popovers/variables-popover'

type TableToolbarProps = {
  onFitAllColumns: () => void
  onResetColumnWidths: () => void
}

// Memoised because a drag writes a width per mouse-move, which re-renders the
// table but changes nothing here.
export const TableToolbar = memo(function TableToolbar({
  onFitAllColumns,
  onResetColumnWidths,
}: TableToolbarProps) {
  return (
    /* Labelled buttons open a panel; the icons beside them act at once. */
    <Group
      h={40}
      px={6}
      gap={4}
      style={{
        flex: 'none',
        // The rule sits under the 40 px row rather than inside it, so the
        // buttons centre on a whole pixel.
        boxSizing: 'content-box',
        borderBottom: '1px solid var(--app-shell-border-color)',
      }}
    >
      <VariablesPopover />
      <TagsPopover />
      {/* A height turns Mantine's stretch on the divider into a top-align. */}
      <Divider
        orientation="vertical"
        h={20}
        mr={12}
        style={{ alignSelf: 'center' }}
      />
      <Tooltip label="Fit all columns" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Fit all columns"
          onClick={onFitAllColumns}
        >
          <IconArrowAutofitWidth
            style={{ width: rem(16), height: rem(16) }}
            stroke={1.5}
          />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Reset column widths" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          ml={4}
          aria-label="Reset column widths"
          onClick={onResetColumnWidths}
        >
          <IconRestore
            style={{ width: rem(16), height: rem(16) }}
            stroke={1.5}
          />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
})
