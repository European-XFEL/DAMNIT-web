import { type CSSProperties, type ReactNode } from 'react'
import { useComputedColorScheme, useMantineTheme } from '@mantine/core'
import { Arrow, type LayerProps, type UseLayerArrowProps } from 'react-laag'

import classes from '../table-tooltip.module.css'

type TableTooltipLayerProps = {
  layerProps: LayerProps
  arrowProps: UseLayerArrowProps
  className: string
  children: ReactNode
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export const TableTooltipLayer = ({
  layerProps,
  arrowProps,
  className,
  children,
  onMouseEnter,
  onMouseLeave,
}: TableTooltipLayerProps) => {
  const theme = useMantineTheme()
  const scheme = useComputedColorScheme('light')
  const surfaceColor =
    scheme === 'dark' ? theme.colors.dark[5] : theme.colors.dark[7]
  const { ref: layerRef, style: layerStyle } = layerProps
  const style = {
    ...layerStyle,
    '--table-tooltip-bg': surfaceColor,
  } as CSSProperties

  return (
    <div
      ref={layerRef}
      className={`${classes.surface} ${className}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      <Arrow
        {...arrowProps}
        backgroundColor={surfaceColor}
        borderWidth={0}
        size={10}
      />
      {children}
    </div>
  )
}
