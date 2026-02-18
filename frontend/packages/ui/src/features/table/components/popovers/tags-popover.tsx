import { useMemo } from 'react'
import isEmpty from 'lodash/isEmpty'
import lodashSize from 'lodash/size'
import { Anchor, rem } from '@mantine/core'
import { IconEye, IconEyeClosed, IconHash } from '@tabler/icons-react'

import { BasePopover } from './base-popover'
import { RowDetails, RowItemCheckbox } from './row-details'
import { SearchableTable } from './searchable-table'
import { ControlButton } from '../control-button'
import { useColumnVisibility } from '../../hooks/use-column-visibility'
import { selectTagSelection } from '../../store/selectors'
import { clearTagSelection, setTagSelection } from '../../table.slice'

import { useAppDispatch, useAppSelector } from '../../../../redux/hooks'

type TagRecord = {
  name: string
  isSelected: boolean
}

type TagDetailProps = {
  name: string
}

function TagDetail({ name }: TagDetailProps) {
  const { variables, tags } = useAppSelector(
    (state) => state.tableData.metadata
  )
  const columnVisibility = useColumnVisibility()

  const items = tags[name].variables.map((varName) => {
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
  const tags = useAppSelector((state) => state.tableData.metadata.tags)

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
