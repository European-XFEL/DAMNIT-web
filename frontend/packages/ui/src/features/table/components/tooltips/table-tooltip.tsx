import { Image, useComputedColorScheme, useMantineTheme } from '@mantine/core'
import { Arrow, type LayerProps, type UseLayerArrowProps } from 'react-laag'

import { type VariableError } from '#src/types'
import { assertNever } from '#src/utils/helpers'
import { ErrorContent } from './error-content'

export type CellTooltip =
  | { kind: 'error'; error: VariableError }
  | { kind: 'image'; src: string }

type TableTooltipProps = {
  target: CellTooltip
  layerProps: LayerProps
  arrowProps: UseLayerArrowProps
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const IMAGE_MAX_SIZE = 300
const SURFACE_RADIUS = 6
const IMAGE_MARGIN = 4

function renderBody(target: CellTooltip) {
  switch (target.kind) {
    case 'error':
      return <ErrorContent error={target.error} />
    case 'image':
      return (
        <Image
          src={target.src}
          alt=""
          decoding="async"
          draggable={false}
          fit="contain"
          m={IMAGE_MARGIN}
          maw={IMAGE_MAX_SIZE}
          mah={IMAGE_MAX_SIZE}
          radius={SURFACE_RADIUS - IMAGE_MARGIN}
          style={{ pointerEvents: 'none' }}
        />
      )
    default:
      return assertNever(target)
  }
}

export function TableTooltip({
  target,
  layerProps,
  arrowProps,
  onMouseEnter,
  onMouseLeave,
}: TableTooltipProps) {
  const theme = useMantineTheme()
  const scheme = useComputedColorScheme('light')
  const surface =
    scheme === 'dark' ? theme.colors.dark[5] : theme.colors.dark[7]
  const { ref, style } = layerProps

  return (
    <div
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        ...style,
        background: surface,
        borderRadius: SURFACE_RADIUS,
        zIndex: 1000,
        boxShadow:
          '0 0 0 1px var(--mantine-color-default-border), var(--mantine-shadow-md)',
      }}
    >
      <Arrow
        {...arrowProps}
        backgroundColor={surface}
        borderWidth={0}
        size={10}
      />
      {renderBody(target)}
    </div>
  )
}
