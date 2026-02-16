import { TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

type FieldSearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
}: FieldSearchInputProps) {
  return (
    <TextInput
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      size="sm"
      placeholder={placeholder}
      leftSection={<IconSearch size={14} />}
      variant="unstyled"
    />
  )
}
