import { Box } from '@mantine/core'

import { formatNumber } from '#src/utils/format'

type SparklinePointProps = { x: number; y: number }

export function SparklinePoint({ x, y }: SparklinePointProps) {
  return (
    <Box ff="monospace" fz="xs">
      <div>x: {formatNumber(x)}</div>
      <div>y: {formatNumber(y)}</div>
    </Box>
  )
}
