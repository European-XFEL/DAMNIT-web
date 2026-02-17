import { useMemo } from 'react'
import {
  Box,
  Checkbox,
  Group,
  Stack,
  Text,
  rem,
  type CheckboxProps,
} from '@mantine/core'
import { IconCheck, IconList, IconCircle } from '@tabler/icons-react'

import { BasePopover } from './base-popover'
import { SearchableTable } from './searchable-table'
import { ControlButton } from '../control-button'
import {
  useColumnVisibilityFromTags,
  useColumnVisibilityFromVariables,
} from '../../hooks/use-column-visibility'
import { selectTagSelection } from '../../store/selectors'
import { setVariableVisibility } from '../../table.slice'

import { useAppDispatch, useAppSelector } from '../../../../redux/hooks'

type VariableVisibility = Record<string, boolean>
type TagSelection = Record<string, boolean>

type VariableCheckboxProps = Pick<
  CheckboxProps,
  'checked' | 'onChange' | 'variant'
>

function VariableCheckbox({
  variant,
  checked,
  onChange,
}: VariableCheckboxProps) {
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

type VariableDetailsProps = {
  tags: TagSelection
}

function VariableDetails({ tags }: VariableDetailsProps) {
  const entries = Object.entries(tags ?? {})
  const selectedCount = entries.reduce((acc, [, v]) => acc + (v ? 1 : 0), 0)

  const sorted = entries
    .slice()
    .sort(
      ([aTag, aSel], [bTag, bSel]) =>
        Number(bSel) - Number(aSel) || aTag.localeCompare(bTag)
    )

  const headerC =
    'light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-2))'
  const unselectedC =
    'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-2))'
  const selectedC =
    'light-dark(var(--mantine-color-gray-9), var(--mantine-color-dark-0))'

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
      <Group justify="space-between" gap={8}>
        <Text
          fz={10}
          fw={500}
          tt="uppercase"
          c={headerC}
          style={{ letterSpacing: 0.8 }}
        >
          Tags
        </Text>

        <Text fz={10} c={headerC} style={{ letterSpacing: 0.6 }}>
          {selectedCount}/{entries.length} selected
        </Text>
      </Group>

      <Stack gap={6}>
        {sorted.map(([tag, isSelected]) => {
          const color = isSelected ? selectedC : unselectedC

          return (
            <Group key={tag} gap={6} wrap="nowrap" align="center">
              <Box
                w={14}
                h={14}
                style={{ display: 'grid', placeItems: 'center' }}
              >
                {isSelected ? (
                  <IconCheck size={13} style={{ color }} />
                ) : (
                  <IconCircle size={6} stroke={2} style={{ color }} />
                )}
              </Box>

              <Text fz={11} lh={1.2} c={color} fw={400} lineClamp={1}>
                {tag}
              </Text>
            </Group>
          )
        })}
      </Stack>
    </Stack>
  )
}

type VariableRecord = {
  name: string
  title: string
  tags: TagSelection
  isVisible: boolean
}

function VariablesTable() {
  const dispatch = useAppDispatch()

  const metadata = useAppSelector((state) => state.tableData.metadata.variables)
  const tagSelection = useAppSelector(selectTagSelection)

  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const visibilityFromTags = useColumnVisibilityFromTags()

  const records = useMemo(
    () =>
      Object.entries(visibilityFromVariables).map(([variable, isVisible]) => {
        const meta = metadata?.[variable]

        const tags = Object.fromEntries(
          (meta?.tags ?? []).map((tag) => [tag, !!tagSelection?.[tag]])
        )

        return {
          name: variable,
          title: meta?.title ?? variable,
          tags,
          isVisible,
        } as VariableRecord
      }),
    [visibilityFromVariables, tagSelection, metadata]
  )

  const applyVisibility = (visibility: VariableVisibility) => {
    dispatch(setVariableVisibility(visibility))
  }

  const buildAllVisibility = (isVisible: boolean) =>
    Object.fromEntries(
      Object.keys(visibilityFromVariables).map((name) => [name, isVisible])
    )

  return (
    <SearchableTable
      searchKey="title"
      searchPlaceholder="Search variables"
      dataTableProps={{
        records,
        columns: [
          { accessor: 'title' },
          {
            accessor: 'isVisible',
            width: rem(36),
            render: ({ name, isVisible }) => (
              <VariableCheckbox
                checked={isVisible}
                onChange={(e) =>
                  applyVisibility({ [name]: e.currentTarget.checked })
                }
                variant={
                  visibilityFromTags == null || visibilityFromTags[name]
                    ? 'filled'
                    : 'outline'
                }
              />
            ),
          },
        ],
        rowExpansion: {
          content: ({ record }) => <VariableDetails tags={record.tags} />,
        },
        idAccessor: 'name',
      }}
      toolbarAction={
        <Checkbox
          checked={Object.values(visibilityFromVariables).every(Boolean)}
          onChange={(e) =>
            applyVisibility(buildAllVisibility(e.currentTarget.checked))
          }
          color="indigo"
          size="sm"
          mr={16}
        />
      }
    />
  )
}

export function VariablesPopover() {
  const visibilityFromVariables = useColumnVisibilityFromVariables()

  const notVisibleCount = Object.values(visibilityFromVariables).filter(
    (v) => v === false
  ).length

  return (
    <BasePopover
      renderTarget={({ opened, toggle }) => (
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={IconList}
          label="Variables"
          badgeCount={notVisibleCount * -1}
        />
      )}
    >
      <VariablesTable />
    </BasePopover>
  )
}
