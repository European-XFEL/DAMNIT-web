import { type ReactNode } from 'react'
import {
  Box,
  Checkbox,
  Group,
  Stack,
  Text,
  type CheckboxProps,
} from '@mantine/core'

const headerC =
  'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))'
const unselectedC =
  'light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-2))'
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
  children: ReactNode
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

        <Text fz={11} lh={1.2} c={color} fw={400} lineClamp={1}>
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
  'checked' | 'onChange' | 'variant'
>

export function RowItemCheckbox({
  checked,
  onChange,
  variant = 'filled',
}: RowItemCheckboxProps) {
  return (
    <Checkbox
      variant={variant}
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      color="indigo"
      size="xs"
    />
  )
}

// ----------------------------------------------------------------------------
// List

export type RowListProps = {
  items: Record<string, boolean>
  renderIndicator?: IndicatorRenderer
}

function List({ items, renderIndicator }: RowListProps) {
  const collator = new Intl.Collator(undefined, {
    sensitivity: 'base',
    numeric: true,
  })

  const entries = Object.entries(items).sort(
    ([aKey, aSelected], [bKey, bSelected]) =>
      aSelected !== bSelected
        ? Number(bSelected) - Number(aSelected)
        : collator.compare(aKey, bKey)
  )

  return (
    <Stack gap={6}>
      {entries.map(([key, selected]) => (
        <Item key={key} selected={selected} renderIndicator={renderIndicator}>
          {key}
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

function Section({ header, info, children }: RowSectionProps) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" gap={8}>
        <Text
          fz={10}
          fw={500}
          tt="uppercase"
          c={headerC}
          style={{ letterSpacing: 0.8 }}
        >
          {header}
        </Text>
        {info != null && (
          <Text fz={10} c={headerC} style={{ letterSpacing: 0.6 }}>
            {info}
          </Text>
        )}
      </Group>

      {children}
    </Stack>
  )
}

// ----------------------------------------------------------------------------
// Root

export type RowDetailsProps = { children: ReactNode }

function Root({ children }: RowDetailsProps) {
  return (
    <Stack
      bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))"
      px="md"
      py="xs"
      gap={6}
      style={{
        borderLeft:
          '3px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-4))',
      }}
    >
      {children}
    </Stack>
  )
}

type RowDetailsComponent = ((props: RowDetailsProps) => JSX.Element) & {
  Section: typeof Section
  List: typeof List
  Item: typeof Item
}

export const RowDetails = Object.assign(Root, {
  Section,
  List,
  Item,
}) as RowDetailsComponent
