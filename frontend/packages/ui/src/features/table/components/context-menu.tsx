import { Stack } from '@mantine/core'
import { ContextMenuPortal as MantineContextMenu } from 'mantine-contextmenu'

import ContextMenuItem, {
  type ContextMenuItemOptions,
} from './context-menu-item'

export type ContextMenuProps = {
  localPosition: { x: number; y: number }
  bounds: { x: number; y: number; width: number; height: number }
  contents: ContextMenuItemOptions[]
  isOpen?: boolean
  onOutsideClick?: () => void
}

const ContextMenu = ({
  localPosition,
  bounds,
  contents,
  isOpen = false,
  onOutsideClick = () => {
    return
  },
}: ContextMenuProps) => {
  return (
    isOpen && (
      <MantineContextMenu
        x={localPosition.x + bounds.x}
        y={localPosition.y + bounds.y}
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
