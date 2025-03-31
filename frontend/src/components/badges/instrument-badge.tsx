import React from "react"
import { Badge, BadgeProps } from "@mantine/core"

enum Instrument {
  SPB = "SPB",
  FXE = "FXE",

  MID = "MID",
  HED = "HED",

  SCS = "SCS",
  SQS = "SQS",
  SXP = "SXP",
}

const DEFAULT_COLOR = "black"

const InstrumentColors: Record<Instrument, string> = {
  [Instrument.SPB]: "#538DD5",
  [Instrument.FXE]: "#7030A0",
  [Instrument.MID]: "#4F6228",
  [Instrument.HED]: "#92D050",
  [Instrument.SCS]: "#16365C",
  [Instrument.SQS]: "#FFFF00",
  [Instrument.SXP]: "#E4DFEC",
}

function getInstrumentColor(instrument: string): string {
  const as_enum =
    Instrument[instrument.toUpperCase() as keyof typeof Instrument]
  return InstrumentColors[as_enum] || DEFAULT_COLOR
}

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
