import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { StatusBadge, DetailsSection } from '../ShotTable'

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
