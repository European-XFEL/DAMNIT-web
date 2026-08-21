import { type ReactNode } from 'react'
import {
  Box,
  Checkbox,
  Group,
  Stack,
  Text,
  type CheckboxProps,
} from '@mantine/core'

export const mutedC =
  'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))'
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

        <Text
          fz={11}
          lh={1.2}
          c={color}
          fw={400}
          lineClamp={1}
          title={children}
        >
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

function List({ items, renderIndicator }: RowListProps) {
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

export type SectionHeadingProps = { children: ReactNode }

// The Variables popover heads a group with this too. The two labels share a
// treatment by decision, so they share the component.
export function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <Text
      fz={10}
      fw={500}
      tt="uppercase"
      c={mutedC}
      style={{ letterSpacing: 0.8 }}
    >
      {children}
    </Text>
  )
}

export type RowSectionProps = {
  header: string
  info?: string
  children: ReactNode
}

function Section({ header, info, children }: RowSectionProps) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" gap={8}>
        <SectionHeading>{header}</SectionHeading>
        {info != null && (
          <Text fz={10} c={mutedC} style={{ letterSpacing: 0.6 }}>
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
      px="sm"
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
