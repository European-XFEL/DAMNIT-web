import { Stack } from '@mantine/core'
import { ContextMenuPortal as MantineContextMenu } from 'mantine-contextmenu'

import type { Point } from '#src/features/table/types/table.types'

import ContextMenuItem, {
  type ContextMenuItemOptions,
} from './context-menu-item'

export type ContextMenuProps = {
  position: Point
  contents: ContextMenuItemOptions[]
  isOpen?: boolean
  onOutsideClick?: () => void
}

const ContextMenu = ({
  position,
  contents,
  isOpen = false,
  onOutsideClick = () => {
    return
  },
}: ContextMenuProps) => {
  return (
    isOpen && (
      <MantineContextMenu
        x={position.x}
        y={position.y}
        onHide={onOutsideClick}
        content={() => (
          <Stack gap={0}>
            {contents.map(({ key, ...props }) => (
              <ContextMenuItem key={key} {...props} />
            ))}
          </Stack>
        )}
      />
    )
  )
}

export default ContextMenu
