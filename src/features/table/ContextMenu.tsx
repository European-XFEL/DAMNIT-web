import React from "react"
import { useLayer } from "react-laag"
import { ContextMenuPortal as MantineContextMenu } from "mantine-contextmenu"

const ContextMenu = ({ localPosition, bounds, onOutsideClick, contents }) => {
  const { layerProps, renderLayer } = useLayer({
    isOpen: true,
    auto: true,
    placement: "bottom-start",
    possiblePlacements: ["bottom-start", "bottom-end"],
    triggerOffset: 2,
    onOutsideClick,
    trigger: {
      getBounds: () => ({
        left: bounds.x ?? 0,
        top: bounds.y ?? 0,
        width: bounds.width ?? 0,
        height: bounds.height ?? 0,
        right: (bounds.x ?? 0) + (bounds.width ?? 0),
        bottom: (bounds.y ?? 0) + (bounds.height ?? 0),
      }),
    },
  })

  return renderLayer(
    <div ref={layerProps.ref}>
      <MantineContextMenu
        x={localPosition.x + bounds.x}
        y={localPosition.y + bounds.y}
        onHide={onOutsideClick}
        content={contents}
      />
    </div>,
  )
}

export default ContextMenu
