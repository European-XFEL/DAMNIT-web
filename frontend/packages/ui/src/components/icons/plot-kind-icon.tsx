import { rem } from '@mantine/core'
import { IconChartArea, IconChartDots } from '@tabler/icons-react'

import { type PlotSource } from '#src/types'

const KIND_ICONS = { summary: IconChartDots, preview: IconChartArea }

type PlotKindIconProps = {
  kind: PlotSource
  size?: number
}

// Hidden from screen readers: wherever it shows, the kind is also spelled out.
function PlotKindIcon({ kind, size }: PlotKindIconProps) {
  const Icon = KIND_ICONS[kind]
  return (
    <Icon
      style={size ? { width: rem(size), height: rem(size) } : undefined}
      stroke={1.5}
      aria-hidden
    />
  )
}

export default PlotKindIcon
