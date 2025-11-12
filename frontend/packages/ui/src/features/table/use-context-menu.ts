import { useState } from 'react'

import { type ContextMenuProps } from './context-menu'

export const useContextMenu = (): [
  ContextMenuProps,
  (newProps: ContextMenuProps) => void,
] => {
  const closedProps = {
    localPosition: { x: 0, y: 0 },
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    isOpen: false,
    contents: [],
  }
  const [props, setProps] = useState<ContextMenuProps>(closedProps)

  const handleOutsideClick = () => {
    setProps(closedProps)
  }

  const updateProps = (newProps: ContextMenuProps) => {
    const updated = newProps ? { ...newProps, isOpen: true } : closedProps
    setProps(updated)
  }

  return [{ ...props, onOutsideClick: handleOutsideClick }, updateProps]
}
