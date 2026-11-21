import { useState } from 'react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

import type { ColumnSuggestion } from '../../types'
import { ContextAssistant, FIRST_SUGGESTIONS } from '../ContextAssistant'

afterEach(cleanup)

const suggestions: ColumnSuggestion[] = Array.from(
  { length: FIRST_SUGGESTIONS + 2 },
  (_, index) => ({
    id: `labfrog:v${index}`,
    title: `Value ${index}`,
    function: `v${index}`,
    origin: 'labfrog',
    originLabel: 'LabFrog record',
    field: `labfrog_variables.v${index}.value`,
    path: `meta#labfrog_variables.v${index}.value`,
    type: 'number',
    unit: '',
    count: 1,
    total: 1,
    examples: [],
    reason: 'Recorded on 1 of 1 shots',
    starter: index === 0,
    block: '',
    display: 'number',
    displayLabel: 'Number column',
    displayHelp: 'Shows the value.',
  })
)

type Props = ComponentProps<typeof ContextAssistant>

/** The assistant with its ticks and selection held as the page holds them. */
function Harness(props: Partial<Props>) {
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <MantineProvider>
      <ContextAssistant
        suggestions={suggestions}
        loading={false}
        error=""
        destination="context.py"
        busy={false}
        ignoredCount={0}
        addedCount={0}
        selectedId={selectedId}
        onSelect={setSelectedId}
        checkedIds={checkedIds}
        onCheckedChange={setCheckedIds}
        onAddMany={vi.fn()}
        onIgnoreMany={vi.fn()}
        onRestoreIgnored={vi.fn()}
        selectedDetail={<div>Detail</div>}
        {...props}
      />
    </MantineProvider>
  )
}

describe('ContextAssistant', () => {
  it('shows the first few suggestions, then the rest on request', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getAllByRole('article')).toHaveLength(FIRST_SUGGESTIONS)
    await user.click(
      screen.getByRole('button', { name: 'Show 2 more suggestions' })
    )
    expect(screen.getAllByRole('article')).toHaveLength(FIRST_SUGGESTIONS + 2)
  })

  it('adds or ignores the ticked suggestions together', async () => {
    const user = userEvent.setup()
    const onAddMany = vi.fn()
    const onIgnoreMany = vi.fn()
    render(<Harness onAddMany={onAddMany} onIgnoreMany={onIgnoreMany} />)
    await user.click(screen.getByRole('checkbox', { name: 'Tick all shown' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tick Value 1' }))
    const add = screen.getByRole('button', {
      name: `Add ${FIRST_SUGGESTIONS - 1} columns`,
    })
    await user.click(add)
    expect(onAddMany).toHaveBeenCalledWith(
      suggestions.slice(0, FIRST_SUGGESTIONS).filter((_, i) => i !== 1)
    )
    await user.click(screen.getByRole('button', { name: 'Ignore ticked' }))
    expect(onIgnoreMany).toHaveBeenCalledTimes(1)
    expect(onIgnoreMany.mock.calls[0][0]).toHaveLength(FIRST_SUGGESTIONS - 1)
  })

  it('opens the selected row’s detail under it and closes the others', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByText('Detail')).not.toBeInTheDocument()
    const row = screen.getByRole('button', { name: 'Value 2' })
    await user.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Detail')).toHaveLength(1)
  })
})
