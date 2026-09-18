import { type ReactNode } from 'react'
import {
  Box,
  Checkbox,
  Group,
  Stack,
  Text,
  type CheckboxProps,
} from '@mantine/core'

import SectionHeading, {
  mutedC,
} from '#src/components/headings/section-heading'

import classes from './row-details.module.css'

// gray-6 on the panel's gray-0 ground is 3.15:1, under the 4.5:1 floor.
const unselectedC =
  'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-2))'
const selectedC =
  'light-dark(var(--mantine-color-gray-9), var(--mantine-color-dark-0))'

// ----------------------------------------------------------------------------
// Item

type IndicatorRenderer = (args: {
  selected: boolean
  color: string
  size?: number
}) => ReactNode

export type RowItemProps = {
  // The label is clamped to one line, so it doubles as the item's tooltip.
  children: string
  selected?: boolean
  renderIndicator?: IndicatorRenderer
}

function Item({
  children,
  selected = false,
  renderIndicator = () => null,
}: RowItemProps) {
  const color = selected ? selectedC : unselectedC
  const indicator = renderIndicator({ selected, color, size: 13 })

  return (
    <Group gap={6} wrap="nowrap" align="center" justify="space-between">
      <Group gap={6} wrap="nowrap" align="center">
        {indicator != null && (
          <Box w={14} h={14} style={{ display: 'grid', placeItems: 'center' }}>
            {indicator}
          </Box>
        )}

        <Text fz="xxs" lh={1.2} c={color} lineClamp={1} title={children}>
          {children}
        </Text>
      </Group>
    </Group>
  )
}

// ----------------------------------------------------------------------------
// Item: Checkbox

type RowItemCheckboxProps = Pick<
  CheckboxProps,
  'checked' | 'onChange' | 'variant' | 'disabled' | 'aria-label'
>

export function RowItemCheckbox({
  checked,
  onChange,
  variant = 'filled',
  disabled,
  'aria-label': label,
}: RowItemCheckboxProps) {
  return (
    <Checkbox
      variant={variant}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      classNames={{ input: classes.checkbox }}
      color="indigo"
      size="xs"
    />
  )
}

// ----------------------------------------------------------------------------
// List

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
})

type RowListItem = {
  name: string
  title: string
  selected: boolean
}

export type RowListProps = {
  items: RowListItem[]
  renderIndicator?: IndicatorRenderer
}

export function RowList({ items, renderIndicator }: RowListProps) {
  // TODO: Change `.sort()` to `.toSorted()` when it's more widely adopted
  const sorted = [...items].sort((a, b) =>
    a.selected !== b.selected
      ? Number(b.selected) - Number(a.selected)
      : collator.compare(a.title, b.title)
  )

  return (
    <Stack gap={6}>
      {sorted.map((item) => (
        <Item
          key={item.name}
          selected={item.selected}
          renderIndicator={renderIndicator}
        >
          {item.title}
        </Item>
      ))}
    </Stack>
  )
}

// ----------------------------------------------------------------------------
// Section

export type RowSectionProps = {
  header: string
  info?: string
  children: ReactNode
}

export function RowSection({ header, info, children }: RowSectionProps) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" gap={8}>
        <SectionHeading>{header}</SectionHeading>
        {info != null && (
          <Text size="xxs" c={mutedC}>
            {info}
          </Text>
        )}
      </Group>

      {children}
    </Stack>
  )
}
