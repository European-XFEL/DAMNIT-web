import { describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import { ContextCellContent } from '../previews'

vi.mock('react-plotly.js', () => ({ default: () => null }))

describe('context table previews', () => {
  it('shows the scalar value in each row rather than a campaign sparkline', () => {
    render(
      <MantineProvider>
        <ContextCellContent value="2.0" />
        <ContextCellContent value="7.9" />
      </MantineProvider>
    )
    expect(screen.getByText('2.0')).toBeInTheDocument()
    expect(screen.getByText('7.9')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    cleanup()
  })

  it('retains previews belonging to the individual record', () => {
    render(
      <MantineProvider>
        <ContextCellContent value="5" preview={[1, 5, 9]} />
      </MantineProvider>
    )
    expect(
      screen.getByRole('img', { name: 'Plot preview sparkline' })
    ).toBeInTheDocument()
    cleanup()
  })
})
