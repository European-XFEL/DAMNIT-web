import { useMemo } from 'react'
import isEmpty from 'lodash/isEmpty'
import lodashSize from 'lodash/size'
import { Anchor, rem } from '@mantine/core'
import { IconEye, IconEyeClosed, IconHash } from '@tabler/icons-react'

import { useTableMeta } from '#src/data/table/use-table-meta'
import { ControlButton } from '#src/features/table/components/control-button'
import { NONCONFIGURABLE_VARIABLES } from '#src/constants'
import { useColumnVisibility } from '#src/features/table/hooks/use-column-visibility'
import { selectTagSelection } from '#src/features/table/store/selectors'
import {
  clearTagSelection,
  setTagSelection,
} from '#src/features/table/table.slice'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'

import { SearchableTable } from './searchable-table'
import { RowDetails, RowItemCheckbox } from './row-details'
import { BasePopover } from './base-popover'

type TagRecord = {
  name: string
  isSelected: boolean
}

type TagDetailProps = {
  name: string
}

function TagDetail({ name }: TagDetailProps) {
  const { variables, tags } = useTableMeta()
  const columnVisibility = useColumnVisibility()

  const items = tags[name].variables
    .filter(
      (varName) =>
        Object.hasOwn(variables, varName) &&
        !NONCONFIGURABLE_VARIABLES.includes(varName)
    )
    .map((varName) => {
      const varMeta = variables[varName]

      return {
        name: varMeta.name,
        title: varMeta.title ?? varMeta.name,
        selected: columnVisibility[varName],
      }
    })

  const visibleCount = items.reduce(
    (acc, item) => acc + Number(item.selected),
    0
  )

  return (
    <RowDetails>
      <RowDetails.Section
        header="Variables"
        info={`${visibleCount}/${lodashSize(items)} visible`}
      >
        <RowDetails.List
          items={items}
          renderIndicator={({ selected, color, size }) =>
            selected ? (
              <IconEye size={size} style={{ color }} />
            ) : (
              <IconEyeClosed size={size} style={{ color }} />
            )
          }
        />
      </RowDetails.Section>
    </RowDetails>
  )
}

export function TagsTable() {
  const dispatch = useAppDispatch()
  const selection = useAppSelector(selectTagSelection)
  const { tags } = useTableMeta()

  const records = useMemo(() => {
    return Object.keys(tags)
      .sort((a, b) => a.localeCompare(b))
      .map(
        (tag) =>
          ({
            name: tag,
            isSelected: !!selection[tag],
          }) as TagRecord
      )
  }, [tags, selection])

  if (isEmpty(records)) {
    return null
  }

  const applySelection = (selection: Record<string, boolean>) =>
    dispatch(setTagSelection(selection))

  return (
    <SearchableTable
      searchKey="name"
      searchPlaceholder="Search tags"
      dataTableProps={{
        records,
        columns: [
          { accessor: 'name' },
          {
            accessor: 'isSelected',
            width: rem(36),
            render: ({ name, isSelected }) => (
              <RowItemCheckbox
                checked={isSelected}
                onChange={(e) =>
                  applySelection({ [name]: e.currentTarget.checked })
                }
              />
            ),
          },
        ],
        rowExpansion: {
          content: ({ record }) => <TagDetail name={record.name} />,
        },
        idAccessor: 'name',
      }}
      toolbarAction={
        <Anchor
          component="button"
          type="button"
          size="xs"
          c="indigo"
          onClick={(_) => dispatch(clearTagSelection())}
          underline="hover"
          mr={10}
        >
          Clear all
        </Anchor>
      }
    />
  )
}

export function TagsPopover() {
  const selection = useAppSelector(selectTagSelection)
  const selectionCount = Object.values(selection).reduce(
    (acc, value) => acc + Number(value),
    0
  )

  return (
    <BasePopover
      renderTarget={({ opened, toggle }) => (
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={IconHash}
          label="Tags"
          badgeCount={selectionCount}
        />
      )}
    >
      <TagsTable />
    </BasePopover>
  )
}
