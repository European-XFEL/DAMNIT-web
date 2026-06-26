import {
  type IBounds,
  type LayerProps,
  type UseLayerArrowProps,
} from 'react-laag'

import { TableTooltipLayer } from './components/table-tooltip-layer'
import classes from './table-tooltip.module.css'

export type ImagePreviewTooltipState = {
  src: string
  bounds: IBounds
}

type ImagePreviewTooltipProps = {
  src: string
  layerProps: LayerProps
  arrowProps: UseLayerArrowProps
}

export function ImagePreviewTooltip({
  src,
  layerProps,
  arrowProps,
}: ImagePreviewTooltipProps) {
  return (
    <TableTooltipLayer
      layerProps={layerProps}
      arrowProps={arrowProps}
      className={classes.imageTooltip}
    >
      <img
        alt=""
        className={classes.image}
        decoding="async"
        draggable={false}
        src={src}
      />
    </TableTooltipLayer>
  )
}
