import { Badge, type BadgeProps } from '@mantine/core'

import { getInstrumentColor } from './instruments'

export interface InstrumentBadgeProps extends BadgeProps {
  instrument: string
}

const InstrumentBadge = ({ instrument, ...props }: InstrumentBadgeProps) => {
  return (
    <Badge
      autoContrast
      color={getInstrumentColor(instrument)}
      size="md"
      radius="md"
      {...props}
    >
      {instrument}
    </Badge>
  )
}

export default InstrumentBadge
