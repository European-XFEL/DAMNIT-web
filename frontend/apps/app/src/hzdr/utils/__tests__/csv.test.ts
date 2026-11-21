import { describe, expect, it } from 'vitest'

import type { HZDRShot } from '../../types'
import { csvField, shotTableCsv } from '../csv'

describe('csvField', () => {
  it('quotes what CSV needs quoted and keeps numbers as numbers', () => {
    expect(csvField(3.5)).toBe('3.5')
    expect(csvField(-2)).toBe('-2')
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(null)).toBe('')
    expect(csvField(Number.NaN)).toBe('')
    expect(csvField(true)).toBe('true')
  })

  it('never lets text start a spreadsheet formula', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('+1')).toBe("'+1")
    expect(csvField('-cmd')).toBe("'-cmd")
    expect(csvField('@sum')).toBe("'@sum")
  })

  it('leaves arrays and objects out', () => {
    expect(csvField([1, 2, 3])).toBe('')
    expect(csvField({ a: 1 })).toBe('')
  })
})

describe('shotTableCsv', () => {
  const shot = (number: number, energy: number): HZDRShot =>
    ({
      source_key: 'c',
      shot_number: number,
      shot_key: `c:20261121:${String(number).padStart(6, '0')}`,
      fired_at: '2026-11-21T10:00:00Z',
      metadata: { status: 'processed', laser: { pulse_energy: energy } },
      events: [],
      data_products: [],
    }) as HZDRShot

  it('writes the rows and columns the table shows, shot_key first', () => {
    const shots = [shot(2, 3.1), shot(1, 2.5)]
    const rows = new Map([
      [
        'c:20261121:000002',
        { shot_number: 2, values: { gain: 7, trace: [1, 2] }, previews: {} },
      ],
    ])
    const csv = shotTableCsv(
      shots,
      [
        { value: 'shot_number', label: 'Shot' },
        { value: 'laser_energy_j', label: 'Energy' },
        { value: 'context:gain', label: 'Gain' },
        { value: 'context:trace', label: 'Trace' },
      ],
      rows as never,
      new Map()
    )
    expect(csv.split('\r\n')).toEqual([
      'shot_key,Shot,Energy,Gain,Trace',
      'c:20261121:000002,2,3.1,7,',
      'c:20261121:000001,1,2.5,,',
      '',
    ])
  })
})
