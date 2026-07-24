import { useMemo } from 'react'
import lodashSize from 'lodash/size'
import { Checkbox, rem } from '@mantine/core'
import { IconCheck, IconList, IconCircle } from '@tabler/icons-react'

import { useTableMeta } from '#src/data/table/use-table-meta'
import { ControlButton } from '#src/features/table/components/control-button'
import {
  useColumnVisibilityFromTags,
  useColumnVisibilityFromVariables,
} from '#src/features/table/hooks/use-column-visibility'
import { selectTagSelection } from '#src/features/table/store/selectors'
import { setVariableVisibility } from '#src/features/table/table.slice'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'

import { SearchableTable } from './searchable-table'
import { RowDetails, RowItemCheckbox } from './row-details'
import { BasePopover } from './base-popover'

type VariableVisibility = Record<string, boolean>

type VariableDetailsProps = {
  name: string
}

function VariableDetails({ name }: VariableDetailsProps) {
  const { variables: metadata } = useTableMeta()
  const tagSelection = useAppSelector(selectTagSelection)

  const items = metadata[name].tags.map((tagName) => ({
    name: tagName,
    title: tagName,
    selected: !!tagSelection?.[tagName],
  }))

  const selectedCount = items.reduce(
    (acc, item) => acc + Number(item.selected),
    0
  )

  return (
    <RowDetails>
      <RowDetails.Section
        header="Tags"
        info={`${selectedCount}/${lodashSize(items)} selected`}
      >
        <RowDetails.List
          items={items}
          renderIndicator={({ selected, color, size }) =>
            selected ? (
              <IconCheck size={size} style={{ color }} />
            ) : (
              <IconCircle size={6} stroke={4} style={{ color }} />
            )
          }
        />
      </RowDetails.Section>
    </RowDetails>
  )
}

type VariableRecord = {
  name: string
  title: string
  isVisible: boolean
}

function VariablesTable() {
  const dispatch = useAppDispatch()

  const { variables: metadata } = useTableMeta()

  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const visibilityFromTags = useColumnVisibilityFromTags()

  const records = useMemo(
    () =>
      Object.entries(visibilityFromVariables).map(([variable, isVisible]) => {
        const meta = metadata?.[variable]

        return {
          name: variable,
          title: meta?.title ?? variable,
          isVisible,
        } as VariableRecord
      }),
    [visibilityFromVariables, metadata]
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
              <RowItemCheckbox
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
          content: ({ record }) => <VariableDetails name={record.name} />,
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
          mr={10}
        />
      }
    />
  )
}

export function VariablesPopover() {
  const visibilityFromTags = useColumnVisibilityFromTags()
  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const notVisibleCount = Object.entries(visibilityFromVariables).reduce(
    (acc, [name, isVisible]) =>
      acc +
      Number(
        (visibilityFromTags == null || visibilityFromTags[name]) && !isVisible
      ),
    0
  )

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
