import { useState, type ChangeEvent } from 'react'
import {
  Box,
  Checkbox,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  rem,
  type ScrollAreaAutosizeProps,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

export type Field = {
  name: string
  title: string
  isVisible: boolean
}

// ---------------------------------------------------------------------------
// Search input

type FieldSearchInputProps = {
  value: string
  onChange: (value: string) => void
}

function FieldSearchInput({ value, onChange }: FieldSearchInputProps) {
  return (
    <TextInput
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      size="sm"
      placeholder="Search fields"
      leftSection={<IconSearch size={14} />}
      variant="unstyled"
    />
  )
}

// ---------------------------------------------------------------------------
// Field settings

type FieldSettingsEntryProps = {
  field: Field
  onVisibilityChange: (visibility: Record<Field['name'], boolean>) => void
}

function FieldSettingsEntry({
  field,
  onVisibilityChange,
}: FieldSettingsEntryProps) {
  return (
    <Box px="sm" py={rem(6)}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="xs">{field.title}</Text>
        <Checkbox
          checked={field.isVisible}
          onChange={(e) =>
            onVisibilityChange({ [field.name]: e.currentTarget.checked })
          }
          color="indigo"
          size="xs"
        />
      </Group>
    </Box>
  )
}

export type FieldSettingsProps = {
  fields: Field[]
  scrollAreaMaxHeight?: ScrollAreaAutosizeProps['mah']
  scrollbarSize?: ScrollAreaAutosizeProps['scrollbarSize']
} & Pick<FieldSettingsEntryProps, 'onVisibilityChange'>

// ---------------------------------------------------------------------------
// Field options list

export function FieldSettings({
  fields,
  scrollAreaMaxHeight = '50vh',
  scrollbarSize = 6,
  onVisibilityChange,
}: FieldSettingsProps) {
  const [query, setQuery] = useState('')

  const allVisible = fields.every((field) => !!field.isVisible)
  const filtered = fields.filter((field) =>
    field.title.toLowerCase().includes(query.toLowerCase())
  )

  function handleAllVisibleChange(event: ChangeEvent<HTMLInputElement>) {
    const isVisible = event.currentTarget.checked
    onVisibilityChange(
      Object.fromEntries(fields.map((field) => [field.name, isVisible]))
    )
  }

  return (
    <Stack gap={2}>
      <Group justify="space-between">
        <FieldSearchInput value={query} onChange={setQuery} />
        <Checkbox
          checked={allVisible}
          onChange={handleAllVisibleChange}
          color="indigo"
          size="sm"
          mr={16}
        />
      </Group>
      <Divider />
      <ScrollArea.Autosize
        mah={scrollAreaMaxHeight}
        scrollbarSize={scrollbarSize}
        type="always"
        offsetScrollbars="y"
        scrollbars="y"
      >
        {filtered.map((field) => (
          <FieldSettingsEntry
            key={field.name}
            field={field}
            onVisibilityChange={onVisibilityChange}
          />
        ))}
      </ScrollArea.Autosize>
    </Stack>
  )
}
