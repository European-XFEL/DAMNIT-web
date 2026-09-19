import { useMemo, useState } from 'react'
import isEmpty from 'lodash/isEmpty'
import lodashSize from 'lodash/size'
import { rem } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconEye, IconEyeClosed, IconHash } from '@tabler/icons-react'

import type { Tag, Variable } from '#src/data/table/table-data.types'
import { getVariableTitle } from '#src/data/table/table-data.transforms'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { NONCONFIGURABLE_VARIABLES, UNTAGGED_TAG } from '#src/constants'
import { useVisibleColumns } from '#src/features/table/hooks/use-column-visibility'
import { useOpenRows } from '#src/features/table/hooks/use-open-rows'
import { selectTagSelection } from '#src/features/table/stores/table.selectors'
import {
  clearTagSelection,
  setTagSelection,
} from '#src/features/table/stores/table.slice'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'

import { ControlButton } from './control-button'
import { ListRow, PopoverLink, PopoverList } from './popover-list'
import { RowItemCheckbox, RowList, RowSection } from './row-details'
import { BasePopover } from './base-popover'

// The variables a tag lists: the ones the table knows and the user can hide.
function listedVariables(tag: Tag, variables: Record<string, Variable>) {
  return tag.variables.filter(
    (name) =>
      Object.hasOwn(variables, name) &&
      !NONCONFIGURABLE_VARIABLES.includes(name)
  )
}

// "(Untagged)" leads by rule: collation alone would put a tag starting with "_"
// or "." above it.
function compareTagNames(a: string, b: string) {
  if (a === UNTAGGED_TAG) {
    return -1
  }
  if (b === UNTAGGED_TAG) {
    return 1
  }
  return a.localeCompare(b)
}

type TagDetailsProps = {
  name: string
}

function TagDetails({ name }: TagDetailsProps) {
  const { variables, tags } = useTableMeta()
  const visibleColumns = useVisibleColumns()

  const items = listedVariables(tags[name], variables).map((varName) => ({
    name: varName,
    title: getVariableTitle(variables[varName]),
    selected: visibleColumns[varName],
  }))

  const visibleCount = items.reduce(
    (acc, item) => acc + Number(item.selected),
    0
  )

  return (
    <RowSection
      header="Variables"
      info={`${visibleCount}/${lodashSize(items)} visible`}
    >
      <RowList
        items={items}
        renderIndicator={({ selected, color, size }) =>
          selected ? (
            <IconEye style={{ width: rem(size), height: rem(size), color }} />
          ) : (
            <IconEyeClosed
              style={{ width: rem(size), height: rem(size), color }}
            />
          )
        }
      />
    </RowSection>
  )
}

function TagList() {
  const dispatch = useAppDispatch()
  const selection = useAppSelector(selectTagSelection)
  const { tags, variables } = useTableMeta()
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebouncedValue(query, 200)
  const { openNames, toggle } = useOpenRows()

  const records = useMemo(
    () =>
      Object.keys(tags)
        .sort(compareTagNames)
        .map((name) => ({
          name,
          isSelected: !!selection[name],
          hasVariables: listedVariables(tags[name], variables).length > 0,
        })),
    [tags, variables, selection]
  )

  if (isEmpty(records)) {
    return null
  }

  // A tag row has nothing but its name to match on.
  const search = debouncedQuery.trim().toLowerCase()
  const shown = records.filter((record) =>
    record.name.toLowerCase().includes(search)
  )

  return (
    <PopoverList
      search={{ value: query, onChange: setQuery, placeholder: 'Search tags' }}
      emptyMessage={shown.length === 0 ? 'No tags match' : undefined}
      // Clearing puts the table back to showing every column, so it drops the
      // whole selection however much of it the search is showing.
      footerEnd={
        <PopoverLink onClick={() => dispatch(clearTagSelection())}>
          Clear all
        </PopoverLink>
      }
    >
      {shown.map(({ name, isSelected, hasVariables }) => (
        <ListRow
          key={name}
          title={name}
          italic={name === UNTAGGED_TAG}
          control={
            <RowItemCheckbox
              aria-label={name}
              checked={isSelected}
              onChange={(e) =>
                dispatch(setTagSelection({ [name]: e.currentTarget.checked }))
              }
            />
          }
          // A tag lists only variables the user can hide, so one with none of
          // those has nothing to open.
          details={hasVariables ? <TagDetails name={name} /> : undefined}
          isOpen={openNames.has(name)}
          onToggle={() => toggle(name)}
        />
      ))}
    </PopoverList>
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
          badge={selectionCount ? `${selectionCount} selected` : undefined}
        />
      )}
    >
      <TagList />
    </BasePopover>
  )
}
