import { useLayer } from 'react-laag'
import { Stack } from '@mantine/core'
import { ContextMenuPortal as MantineContextMenu } from 'mantine-contextmenu'

import ContextMenuItem, {
  type ContextMenuItemOptions,
} from './context-menu-item'
import { toBounds } from './bounds'

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
  const { layerProps, renderLayer } = useLayer({
    isOpen,
    auto: true,
    placement: 'bottom-start',
    possiblePlacements: ['bottom-start', 'bottom-end'],
    triggerOffset: 2,
    // onOutsideClick,
    trigger: {
      getBounds: () => toBounds(bounds),
    },
  })

  return (
    isOpen &&
    renderLayer(
      <div ref={layerProps.ref}>
        <MantineContextMenu
          x={localPosition.x + bounds.x}
          y={localPosition.y + bounds.y}
          onHide={onOutsideClick}
          content={(_) => (
            <Stack>
              {contents.map(({ key, ...props }) => (
                <ContextMenuItem key={key} {...props} />
              ))}
            </Stack>
          )}
        />
      </div>
    )
  )
}

export default ContextMenu
