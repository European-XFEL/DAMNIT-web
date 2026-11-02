const Instrument = {
  SPB: 'SPB',
  FXE: 'FXE',
  MID: 'MID',
  HED: 'HED',
  SCS: 'SCS',
  SQS: 'SQS',
  SXP: 'SXP',
} as const

type Instrument = (typeof Instrument)[keyof typeof Instrument]

// The facility's instruments, in beamline order.
export const INSTRUMENTS: readonly string[] = Object.values(Instrument)

const DEFAULT_COLOR = 'black'

const InstrumentColors: Record<Instrument, string> = {
  [Instrument.SPB]: '#538DD5',
  [Instrument.FXE]: '#7030A0',
  [Instrument.MID]: '#4F6228',
  [Instrument.HED]: '#92D050',
  [Instrument.SCS]: '#16365C',
  [Instrument.SQS]: '#FFFF00',
  [Instrument.SXP]: '#E4DFEC',
}

export function getInstrumentColor(instrument: string): string {
  const key = Instrument[instrument.toUpperCase() as keyof typeof Instrument]
  return InstrumentColors[key] || DEFAULT_COLOR
}
