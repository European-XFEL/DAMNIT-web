import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import type { HZDRShot } from '../../types'
import { ColumnPreview } from '../ColumnPreview'
import type { ColumnPreviewInput } from '../ColumnPreview'
import {
  campaignValues,
  cellValue,
  formatPreviewNumber,
  isDatasetPreview,
  parseRecordedNumber,
} from '../../utils/columnPreview'

vi.mock('../previews', () => ({
  MetadataTrendPreview: ({
    title,
    values,
  }: {
    title: string
    values: unknown[]
  }) => (
    <div>
      Trend: {title} ({values.length} points)
    </div>
  ),
  CanvasImage: () => <div role="img" aria-label="Image preview" />,
}))

afterEach(cleanup)

const shot = (number: number, variables: Record<string, unknown>) =>
  ({
    source_key: 'radbio',
    shot_number: number,
    fired_at: '2026-05-05T08:15:00Z',
    shot_key: `radbio:20260505:${number}`,
    metadata: {
      labfrog_variables: Object.fromEntries(
        Object.entries(variables).map(([name, value]) => [name, { value }])
      ),
    },
    events: [],
    data_products: [],
  }) as unknown as HZDRShot

const shots = [
  shot(1, { charge: '1,5', group: 'A' }),
  shot(2, { charge: '3', group: 'B' }),
  shot(3, { charge: 'n/a', group: 'A' }),
  shot(4, {}),
]

function renderPreview(input: ColumnPreviewInput, exampleShot = shots[0]) {
  render(
    <MantineProvider>
      <ColumnPreview
        title="Charge"
        input={input}
        exampleShot={exampleShot}
        shots={shots}
      />
    </MantineProvider>
  )
}

describe('column preview helpers', () => {
  it('reads numbers the way a suggested column does', () => {
    expect(parseRecordedNumber('99,4')).toBe(99.4)
    expect(parseRecordedNumber(' 3 ')).toBe(3)
    expect(parseRecordedNumber(2)).toBe(2)
    expect(parseRecordedNumber('n/a')).toBeNull()
    expect(parseRecordedNumber('')).toBeNull()
    expect(parseRecordedNumber(true)).toBeNull()
  })

  it('formats numbers without padding', () => {
    expect(formatPreviewNumber(1.5)).toBe('1.5')
    expect(formatPreviewNumber(123.456)).toBe('123.5')
    expect(formatPreviewNumber(2061)).toBe('2061')
    expect(formatPreviewNumber(2.33e-5)).toBe('2.33e-5')
  })

  it('says what a cell holds', () => {
    const field = 'labfrog_variables.charge.value'
    expect(cellValue(shots[0], field, 'number')).toEqual({
      state: 'number',
      value: 1.5,
    })
    expect(cellValue(shots[2], field, 'number')).toEqual({
      state: 'not-a-number',
      value: 'n/a',
    })
    expect(cellValue(shots[3], field, 'number')).toEqual({ state: 'missing' })
    expect(cellValue(shots[2], field, 'text')).toEqual({
      state: 'text',
      value: 'n/a',
    })
  })

  it('collects a field across the campaign', () => {
    const charge = campaignValues(shots, 'labfrog_variables.charge.value')
    expect(charge.recorded).toBe(3)
    expect(charge.total).toBe(4)
    expect(charge.numbers.map((entry) => entry.value)).toEqual([1.5, 3])
    // two of three parse: not enough for a number column
    expect(charge.numeric).toBe(false)
    const group = campaignValues(shots, 'labfrog_variables.group.value')
    expect(group.labels).toEqual([
      ['A', 2],
      ['B', 1],
    ])
  })

  it('accepts only dataset previews', () => {
    expect(
      isDatasetPreview({
        name: 'a',
        dtype: 'f8',
        shape: [2],
        preview: [1, 2],
        preview_kind: 'line',
      })
    ).toBe(true)
    expect(isDatasetPreview({ shot: {}, hdf5_datasets: [] })).toBe(false)
    expect(isDatasetPreview(null)).toBe(false)
  })
})

describe('ColumnPreview', () => {
  it('shows the example cell with its unit and the campaign trend', () => {
    renderPreview({
      source: 'metadata',
      field: 'labfrog_variables.charge.value',
      type: 'number',
      unit: 'nC',
    })
    expect(screen.getByText('1.5 nC')).toBeInTheDocument()
    expect(screen.getByText('Shot 1')).toBeInTheDocument()
    expect(
      screen.getByText('Across the campaign: 3 of 4 shots')
    ).toBeInTheDocument()
    expect(screen.getByText('Trend: Charge (2 points)')).toBeInTheDocument()
  })

  it('marks a value that is not a number, and a missing one', () => {
    const input: ColumnPreviewInput = {
      source: 'metadata',
      field: 'labfrog_variables.charge.value',
      type: 'number',
    }
    renderPreview(input, shots[2])
    expect(screen.getByText('n/a')).toHaveAttribute(
      'title',
      'Not a number: check this value in LabFrog'
    )
    cleanup()
    renderPreview(input, shots[3])
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })

  it('shows labels as counts when the field is text', () => {
    renderPreview({
      source: 'metadata',
      field: 'labfrog_variables.group.value',
      type: 'auto',
    })
    expect(screen.getByLabelText('A: 2 shots')).toBeInTheDocument()
    expect(screen.getByLabelText('B: 1 shots')).toBeInTheDocument()
  })

  it('shows a dataset’s mean in the cell and its image on double-click', () => {
    renderPreview({
      source: 'hdf5',
      display: 'image-preview',
      loading: false,
      preview: {
        name: 'cam/image',
        dtype: 'uint16',
        shape: [512, 512],
        preview: [
          [0, 1],
          [1, 0],
        ],
        preview_kind: 'image',
        summary: 123.456,
        summary_exact: false,
      },
    })
    expect(screen.getByText('≈ 123.5')).toBeInTheDocument()
    expect(screen.getByText('On double-click')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Image preview' })).toBeVisible()
    expect(screen.getByText(/estimated from the preview/)).toBeInTheDocument()
  })

  it('leaves gaps in a lineout where values are not numbers', () => {
    renderPreview({
      source: 'hdf5',
      display: 'lineout-preview',
      loading: false,
      preview: {
        name: 'spec/line',
        dtype: 'float64',
        shape: [3],
        // NaN and infinities arrive from JSON as null
        preview: [1, null, 3] as unknown as number[],
        preview_kind: 'line',
        summary: null,
        summary_exact: true,
      },
    })
    expect(screen.getByText('Trend: Charge (2 points)')).toBeInTheDocument()
    expect(screen.getByText('Not a number')).toBeInTheDocument()
  })

  it('says why a computed column has no preview', () => {
    renderPreview({ source: 'computed', note: 'Computed at load.' })
    expect(screen.getByText('Computed at load.')).toBeInTheDocument()
  })
})
