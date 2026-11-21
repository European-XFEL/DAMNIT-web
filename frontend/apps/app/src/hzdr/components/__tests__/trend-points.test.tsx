import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

import { MetadataTrendPreview } from '../previews'

afterEach(cleanup)

const values = [1, 2, 3].map((n) => ({
  shotNumber: n,
  value: n / 10,
  rowKey: `row-${n}`,
  label: String(n),
}))

describe('trend points', () => {
  it('open their shot on click or Enter, and mark the selected one', async () => {
    const user = userEvent.setup()
    const onSelectPoint = vi.fn()
    render(
      <MantineProvider>
        <MetadataTrendPreview
          values={values}
          selectedRowKey="row-2"
          onSelectPoint={onSelectPoint}
        />
      </MantineProvider>
    )
    const point = screen.getByRole('button', { name: /^Open Shot 3: / })
    await user.click(point)
    expect(onSelectPoint).toHaveBeenCalledWith('row-3')
    point.focus()
    await user.keyboard('{Enter}')
    expect(onSelectPoint).toHaveBeenCalledTimes(2)
    expect(
      screen.getByRole('button', { name: /^Open Shot 2: / })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('stay a plain picture without a handler', () => {
    render(
      <MantineProvider>
        <MetadataTrendPreview values={values} />
      </MantineProvider>
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
