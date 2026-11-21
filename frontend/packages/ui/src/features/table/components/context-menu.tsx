import { Stack } from '@mantine/core'
import { ContextMenuPortal as MantineContextMenu } from 'mantine-contextmenu'

import type { Point } from '#src/features/table/types/table.types'

import classes from './context-menu.module.css'
import ContextMenuItem, {
  type ContextMenuItemOptions,
} from './context-menu-item'
import NewWindowButton from './new-window-button'

export type ContextMenuProps = {
  position: Point
  contents: (ContextMenuItemOptions & { windowLink?: string })[]
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
            {contents.map(({ key, windowLink, ...props }) =>
              windowLink === undefined ? (
                <ContextMenuItem key={key} {...props} />
              ) : (
                // Beside the item, not in it: the library draws each item as
                // a button, which cannot hold another control.
                <div key={key} className={classes.row}>
                  <ContextMenuItem key={key} {...props} />
                  <NewWindowButton
                    to={windowLink}
                    className={classes.newWindow}
                    // A click in the menu reaches the library's overlay, which
                    // cancels it, so the tab would never open.
                    onClick={(event) => {
                      event.stopPropagation()
                      onOutsideClick()
                    }}
                    // A middle-click opens the tab too, but never reaches
                    // the overlay, which closes only on a click.
                    onAuxClick={(event) => {
                      if (event.button === 1) {
                        onOutsideClick()
                      }
                    }}
                  />
                </div>
              )
            )}
          </Stack>
        )}
      />
    )
  )
}

export default ContextMenu
