import { Portal } from '@mantine/core'

import classes from './table-tooltip.module.css'

export const IMAGE_PREVIEW_TOOLTIP_MAX_SIZE = 300

export type ImagePreviewTooltipState = {
  src: string
  left: number
  top: number
}

type ImagePreviewTooltipProps = {
  preview: ImagePreviewTooltipState | null
}

export function ImagePreviewTooltip({ preview }: ImagePreviewTooltipProps) {
  if (!preview) {
    return null
  }

  return (
    <Portal>
      <div
        aria-hidden
        className={`${classes.surface} ${classes.imageTooltip}`}
        style={{
          left: preview.left,
          top: preview.top,
          maxWidth: IMAGE_PREVIEW_TOOLTIP_MAX_SIZE,
          maxHeight: IMAGE_PREVIEW_TOOLTIP_MAX_SIZE,
        }}
      >
        <img
          alt=""
          className={classes.image}
          decoding="async"
          draggable={false}
          src={preview.src}
        />
      </div>
    </Portal>
  )
}
