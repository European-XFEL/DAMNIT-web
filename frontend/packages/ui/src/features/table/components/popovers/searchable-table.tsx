import { useMemo, useState, type ReactNode } from 'react'
import { Divider, Group, ScrollArea, Stack, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import {
  DataTable,
  type DataTableProps as MantineDataTableProps,
} from 'mantine-datatable'

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
}: SearchInputProps) {
  return (
    <TextInput
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      size="sm"
      placeholder={placeholder}
      leftSection={<IconSearch size={14} />}
      variant="unstyled"
      style={{ minWidth: 100 }}
    />
  )
}

type DataTableProps<T> = Required<
  Pick<
    MantineDataTableProps<T>,
    'records' | 'columns' | 'rowExpansion' | 'idAccessor'
  >
> &
  Pick<MantineDataTableProps<T>, 'rowClassName'>

export type SearchableTableProps<T> = {
  dataTableProps: DataTableProps<T>
  searchPlaceholder: SearchInputProps['placeholder']
  // What the search box matches. Each popover's rows differ, so each owns its
  // filter. `query` arrives trimmed and lowercased.
  filterRecords: (records: T[], query: string) => T[]
  toolbarAction?: ReactNode
}

export function SearchableTable<T>({
  dataTableProps,
  searchPlaceholder,
  filterRecords,
  toolbarAction,
}: SearchableTableProps<T>) {
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebouncedValue(query, 200)

  const { records, ...forwardedDataTableProps } = dataTableProps

  const filtered = useMemo(
    () => filterRecords(records, debouncedQuery.trim().toLowerCase()),
    [records, filterRecords, debouncedQuery]
  )

  return (
    <Stack gap={2}>
      {/* header */}
      <Group justify="space-between">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
        />
        {toolbarAction}
      </Group>

      <Divider />

      {/* body */}
      <ScrollArea.Autosize
        mah="50vh"
        scrollbarSize={6}
        type="always"
        offsetScrollbars="x"
        scrollbars="y"
      >
        <DataTable
          noHeader
          highlightOnHover
          fz="xs"
          withRowBorders={false}
          records={filtered}
          {...forwardedDataTableProps}
        />
      </ScrollArea.Autosize>
    </Stack>
  )
}
