import { useMemo } from 'react'
import lodashSize from 'lodash/size'
import { Anchor, rem, Text } from '@mantine/core'
import { IconCheck, IconList, IconCircle } from '@tabler/icons-react'

import { useTableMeta } from '#src/data/table/use-table-meta'
import {
  useColumnVisibilityFromTags,
  useColumnVisibilityFromVariables,
} from '#src/features/table/hooks/use-column-visibility'
import { selectTagSelection } from '#src/features/table/stores/table.selectors'
import { setColumnVisibility } from '#src/features/table/stores/table.slice'
import {
  buildVariableRecords,
  filterVariableRecords,
  type VariableTableRecord,
} from '#src/features/table/utils/variable-records'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'

import { ControlButton } from './control-button'
import { SearchableTable } from './searchable-table'
import {
  mutedC,
  RowDetails,
  RowItemCheckbox,
  SectionHeading,
} from './row-details'
import { BasePopover } from './base-popover'
import classes from './variables-popover.module.css'

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

// Shows or hides a set of variables at once. The underline marks a set the tag
// filter refuses; the min width holds the popover still as the label flips.
type VisibilityActionProps = {
  allShown: boolean
  onToggle: (isVisible: boolean) => void
  passesTagFilter?: boolean
  fz: number | string
  mr?: number
}

function VisibilityAction({
  allShown,
  onToggle,
  passesTagFilter = true,
  fz,
  mr,
}: VisibilityActionProps) {
  return (
    <Anchor
      component="button"
      type="button"
      c={passesTagFilter ? 'indigo' : mutedC}
      td={passesTagFilter ? undefined : 'underline'}
      underline="hover"
      miw={rem(52)}
      ta="right"
      fz={fz}
      mr={mr}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(!allShown)
      }}
    >
      {allShown ? 'Hide all' : 'Show all'}
    </Anchor>
  )
}

function VariablesTable() {
  const dispatch = useAppDispatch()

  const { variables: metadata, groups } = useTableMeta()

  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const visibilityFromTags = useColumnVisibilityFromTags()
  const variableNames = Object.keys(visibilityFromVariables)

  const records = useMemo(
    () =>
      buildVariableRecords({
        variables: metadata,
        groups,
        visibility: visibilityFromVariables,
        tagFilter: visibilityFromTags,
      }),
    [visibilityFromVariables, visibilityFromTags, metadata, groups]
  )

  const applyVisibility = (visibility: VariableVisibility) => {
    dispatch(setColumnVisibility(visibility))
  }

  const buildVisibility = (names: string[], isVisible: boolean) =>
    Object.fromEntries(names.map((name) => [name, isVisible]))

  const rowClassName = (record: VariableTableRecord) => {
    if (record.kind === 'group') {
      return classes.group
    }

    if (record.group != null) {
      return classes.member
    }

    return undefined
  }

  // A group reads as a heading over the rows below it; a variable row reads as
  // itself.
  const renderTitle = (record: VariableTableRecord) => {
    if (record.kind === 'group') {
      return <SectionHeading>{record.title}</SectionHeading>
    }

    return (
      <Text fz="xs" pl={record.group != null ? 'sm' : 0}>
        {record.columnTitle}
      </Text>
    )
  }

  // A group takes the checkbox cell to show or hide its members, so every
  // control in the popover ends on one vertical. Outline says the tag filter
  // refuses the column whatever its checkbox says.
  const renderVisibility = (record: VariableTableRecord) => {
    if (record.kind === 'group') {
      return (
        <VisibilityAction
          fz={11}
          allShown={record.isVisible}
          passesTagFilter={record.passesTagFilter}
          onToggle={(isVisible) =>
            applyVisibility(buildVisibility(record.members, isVisible))
          }
        />
      )
    }

    return (
      <RowItemCheckbox
        checked={record.isVisible}
        onChange={(e) =>
          applyVisibility({ [record.name]: e.currentTarget.checked })
        }
        variant={record.passesTagFilter ? 'filled' : 'outline'}
      />
    )
  }

  return (
    <SearchableTable
      searchPlaceholder="Search variables"
      filterRecords={filterVariableRecords}
      dataTableProps={{
        records,
        columns: [
          {
            accessor: 'title',
            render: renderTitle,
          },
          {
            accessor: 'isVisible',
            width: rem(36),
            render: renderVisibility,
          },
        ],
        rowExpansion: {
          // mantine-datatable renders the details in a row of its own, outside
          // the member row the rail is drawn on, so a grouped variable's panel
          // carries the rail itself.
          content: ({ record }) => {
            const details = <VariableDetails name={record.name} />
            return record.kind === 'variable' && record.group != null ? (
              <div className={classes.memberDetails}>{details}</div>
            ) : (
              details
            )
          },
          // Tags are all the details there are, so an untagged variable has
          // nothing to open.
          expandable: ({ record }) =>
            record.kind === 'variable' && record.hasDetails,
        },
        idAccessor: (record) => `${record.kind}:${record.name}`,
        rowClassName,
      }}
      toolbarAction={
        variableNames.length > 0 ? (
          <VisibilityAction
            fz="xs"
            mr={10}
            allShown={variableNames.every(
              (name) => visibilityFromVariables[name]
            )}
            onToggle={(isVisible) =>
              applyVisibility(buildVisibility(variableNames, isVisible))
            }
          />
        ) : null
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
