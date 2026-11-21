import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import type { HZDRShot } from '../../types'
import { StatusBadge, DetailsSection, HZDRShotSetsPanel } from '../ShotTable'

vi.mock('../previews', () => ({
  MetadataTrendPreview: ({ values }: { values: unknown[] }) => (
    <div>{values.length} trend points</div>
  ),
  ContextPreviewValue: () => null,
}))

function withMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('StatusBadge', () => {
  it('renders the label for processed', () => {
    withMantine(<StatusBadge status="processed" />)
    expect(screen.getByText('Processed')).toBeInTheDocument()
  })

  it('renders the label for needs-review', () => {
    withMantine(<StatusBadge status="needs-review" />)
    expect(screen.getByText('Needs review')).toBeInTheDocument()
  })

  it('renders the label for revision-needed', () => {
    withMantine(<StatusBadge status="revision-needed" />)
    expect(screen.getByText('Needs revision')).toBeInTheDocument()
  })

  it('renders the raw status string for unknown values', () => {
    withMantine(<StatusBadge status="custom-status" />)
    expect(screen.getByText('custom-status')).toBeInTheDocument()
  })
})

describe('DetailsSection', () => {
  it('renders its title', () => {
    render(
      <DetailsSection title="My Section">
        <p>child content</p>
      </DetailsSection>
    )
    expect(screen.getByText('My Section')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <DetailsSection title="Section">
        <p>Hello from inside</p>
      </DetailsSection>
    )
    expect(screen.getByText('Hello from inside')).toBeInTheDocument()
  })

  it('is closed by default', () => {
    const { container } = render(
      <DetailsSection title="Collapsed">
        <p>body</p>
      </DetailsSection>
    )
    const details = container.querySelector('details')
    expect(details).not.toHaveAttribute('open')
  })

  it('opens when open prop is true', () => {
    const { container } = render(
      <DetailsSection title="Open" open>
        <p>body</p>
      </DetailsSection>
    )
    const details = container.querySelector('details')
    expect(details).toHaveAttribute('open')
  })
})

describe('HZDRShotSetsPanel', () => {
  it('labels trend values readably and keeps the key as the value', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const shots: HZDRShot[] = [1, 2].map((number) => ({
      source_key: 'demo',
      shot_number: number,
      fired_at: '2026-07-01T10:00:00Z',
      metadata: { diagnostic: { alignment_score: 0.8 + number / 100 } },
      events: [],
      data_products: [],
    }))
    withMantine(<HZDRShotSetsPanel shots={shots} />)
    expect(screen.getByRole('textbox', { name: 'Trend value' })).toHaveValue(
      'Diagnostic / Alignment score'
    )
    expect(screen.getByText('2 trend points')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
