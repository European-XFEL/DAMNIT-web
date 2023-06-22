import React from "react";
import { useLayer } from "react-laag";
import { ContextMenu as MantineContextMenu } from "../../extern/mantine-contextmenu/ContextMenu";

const ContextMenu = ({ localPosition, bounds, onOutsideClick }) => {
  const { layerProps, renderLayer } = useLayer({
    isOpen: true,
    auto: true,
    placement: "bottom-end",
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
  });

  return renderLayer(
    <div ref={layerProps.ref}>
      <MantineContextMenu
        x={localPosition.x + bounds.x}
        y={localPosition.y + bounds.y}
        onHide={onOutsideClick}
        content={[
          {
            key: "option1",
            title: "Option 1",
            onClick: () => console.log("OPTION 1"),
          },
          {
            key: "option2",
            title: "Option 2",
            onClick: () => console.log("OPTION 2"),
          },
        ]}
      ></MantineContextMenu>
    </div>
  );
};

export default ContextMenu;
