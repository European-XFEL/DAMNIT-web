import { memo } from 'react'
import { ActionIcon, Divider, Group, Tooltip } from '@mantine/core'
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
    <Group px={6}>
      <VariablesPopover />
      <TagsPopover />
      {/* A height turns Mantine's stretch on the divider into a top-align. */}
      <Divider orientation="vertical" h={20} style={{ alignSelf: 'center' }} />
      <Tooltip label="Fit all columns" fz="xs" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Fit all columns"
          onClick={onFitAllColumns}
        >
          <IconArrowAutofitWidth size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Reset column widths" fz="xs" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Reset column widths"
          onClick={onResetColumnWidths}
        >
          <IconRestore size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
})
