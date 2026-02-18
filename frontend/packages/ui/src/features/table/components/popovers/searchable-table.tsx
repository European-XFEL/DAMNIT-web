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
>

export type SearchableTableProps<T> = {
  dataTableProps: DataTableProps<T>
  searchKey: keyof T
  searchPlaceholder: SearchInputProps['placeholder']
  toolbarAction?: ReactNode
}

export function SearchableTable<T>({
  dataTableProps,
  searchKey,
  searchPlaceholder,
  toolbarAction,
}: SearchableTableProps<T>) {
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebouncedValue(query, 200)

  const { records, ...forwardedDataTableProps } = dataTableProps

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const entry = record[searchKey] as string
        return entry.toLowerCase().includes(debouncedQuery.trim().toLowerCase())
      }),

    [records, searchKey, debouncedQuery]
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
        offsetScrollbars="present"
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
