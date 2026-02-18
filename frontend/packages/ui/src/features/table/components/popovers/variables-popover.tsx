import { useMemo } from 'react'
import lodashSize from 'lodash/size'
import { Checkbox, rem } from '@mantine/core'
import { IconCheck, IconList, IconCircle } from '@tabler/icons-react'

import { BasePopover } from './base-popover'
import { RowDetails, RowItemCheckbox } from './row-details'
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

type VariableDetailsProps = {
  name: string
}

function VariableDetails({ name }: VariableDetailsProps) {
  const metadata = useAppSelector((state) => state.tableData.metadata.variables)
  const tagSelection = useAppSelector(selectTagSelection)

  const tags = Object.fromEntries(
    metadata[name].tags.map((tag) => [tag, !!tagSelection?.[tag]])
  )

  const selectedCount = Object.values(tags).reduce(
    (acc, value) => acc + Number(value),
    0
  )

  return (
    <RowDetails>
      <RowDetails.Section
        header="Tags"
        info={`${selectedCount}/${lodashSize(tags)} selected`}
      >
        <RowDetails.List
          items={tags}
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

  const metadata = useAppSelector((state) => state.tableData.metadata.variables)

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
          mr={16}
        />
      }
    />
  )
}

export function VariablesPopover() {
  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const notVisibleCount = Object.values(visibilityFromVariables).reduce(
    (acc, value) => acc + Number(!value),
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
