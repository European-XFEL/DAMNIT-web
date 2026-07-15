import { describe, expect, test } from 'vitest'

import { SearchableTable } from '#src/features/table/components/popovers/searchable-table'
import { renderWithProviders } from '#tests/support/render'

type Row = { id: string; title: string }

const records: Row[] = [
  { id: '1', title: 'Energy' },
  { id: '2', title: 'Delay' },
  { id: '3', title: 'Temperature' },
]

function renderTable() {
  return renderWithProviders(
    <SearchableTable<Row>
      searchKey="title"
      searchPlaceholder="Search"
      dataTableProps={{
        records,
        columns: [{ accessor: 'title' }],
        rowExpansion: { content: () => null },
        idAccessor: 'id',
      }}
    />
  )
}

describe('SearchableTable', () => {
  test('renders every row before any search', async () => {
    const screen = await renderTable()

    await expect.element(screen.getByText('Energy')).toBeVisible()
    await expect.element(screen.getByText('Delay')).toBeVisible()
    await expect.element(screen.getByText('Temperature')).toBeVisible()
  })

  test('narrows the rows to the debounced query, then restores them', async () => {
    const screen = await renderTable()
    const search = screen.getByPlaceholder('Search')

    await search.fill('  ENER ')

    await expect.element(screen.getByText('Energy')).toBeVisible()
    await expect.element(screen.getByText('Delay')).not.toBeInTheDocument()

    await search.fill('')

    await expect.element(screen.getByText('Delay')).toBeVisible()
  })
})
