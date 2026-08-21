import { getVariableTitle } from '#src/data/table/table-data.transforms'
import type { TableMeta } from '#src/data/table/table-data.types'
import {
  getColumnTitle,
  getGroupTitle,
} from '#src/features/table/utils/column-title'

// A group's row in the popover, heading the members it toggles. Under a search
// that is only the members still on screen; the row shows when they all do.
type GroupRecord = {
  kind: 'group'
  name: string
  title: string
  members: string[]
  isVisible: boolean
  passesTagFilter: boolean
}

// One variable. `title` is whole, so typing the group's words finds its members;
// `columnTitle` drops the prefix the row above already carries.
type VariableRecord = {
  kind: 'variable'
  name: string
  title: string
  columnTitle: string
  group?: string
  isVisible: boolean
  passesTagFilter: boolean
  hasDetails: boolean
}

export type VariableTableRecord = GroupRecord | VariableRecord

// What a group row answers for its members: shown once they all are, allowed by
// the tag filter while any of them is.
function summarizeGroup(members: VariableRecord[]) {
  return {
    members: members.map((member) => member.name),
    isVisible: members.every((member) => member.isVisible),
    passesTagFilter: members.some((member) => member.passesTagFilter),
  }
}

type BuildVariableRecordsOptions = {
  variables: TableMeta['variables']
  groups: TableMeta['groups']
  visibility: Record<string, boolean>
  // Which columns the selected tags allow, or null when no tag is selected. A
  // row that fails it still shows, but its checkbox cannot win.
  tagFilter: Record<string, boolean> | null
}

// The popover's rows, in table order. The API gathers each group's members into
// one block, so a group row goes in where its first member appears. Only the
// columns the user can configure have a visibility entry; the rest are skipped.
export function buildVariableRecords({
  variables,
  groups,
  visibility,
  tagFilter,
}: BuildVariableRecordsOptions): VariableTableRecord[] {
  const records: VariableTableRecord[] = []
  const membersByGroup = new Map<string, VariableRecord[]>()

  for (const [name, variable] of Object.entries(variables)) {
    const isVisible = visibility[name]
    if (isVisible === undefined) {
      continue
    }

    const group = variable.group
    const title = getVariableTitle(variable)
    const record: VariableRecord = {
      kind: 'variable',
      name,
      title,
      columnTitle: getColumnTitle({ title, group }, groups),
      group,
      isVisible,
      passesTagFilter: tagFilter == null || !!tagFilter[name],
      hasDetails: variable.tags.length > 0,
    }

    if (group != null) {
      const members = membersByGroup.get(group)
      if (members === undefined) {
        membersByGroup.set(group, [record])
        records.push({
          kind: 'group',
          name: group,
          title: getGroupTitle(group, groups),
          members: [],
          isVisible: true,
          passesTagFilter: true,
        })
      } else {
        members.push(record)
      }
    }

    records.push(record)
  }

  for (const record of records) {
    if (record.kind === 'group') {
      Object.assign(
        record,
        summarizeGroup(membersByGroup.get(record.name) ?? [])
      )
    }
  }

  return records
}

// Keep a variable when its whole title matches, or when its group's does; keep
// a group row when any of its members survived. A member without its group row
// would read as an indented orphan.
export function filterVariableRecords(
  records: VariableTableRecord[],
  query: string
): VariableTableRecord[] {
  if (query === '') {
    return records
  }

  const matches = (title: string) => title.toLowerCase().includes(query)

  // A group row always precedes its members, so one pass can ask whether the
  // group matched before reaching them.
  const matchedGroups = new Set<string>()
  const shownByGroup = new Map<string, VariableRecord[]>()
  const kept: VariableTableRecord[] = []

  for (const record of records) {
    if (record.kind === 'group') {
      if (matches(record.title)) {
        matchedGroups.add(record.name)
      }
      kept.push(record)
      continue
    }

    const group = record.group
    const isShown =
      matches(record.title) || (group != null && matchedGroups.has(group))
    if (!isShown) {
      continue
    }

    if (group != null) {
      const shown = shownByGroup.get(group)
      if (shown === undefined) {
        shownByGroup.set(group, [record])
      } else {
        shown.push(record)
      }
    }

    kept.push(record)
  }

  // A group row answers for the members the search left on screen, so its link
  // never touches a variable the user cannot see.
  return kept.flatMap((record) => {
    if (record.kind !== 'group') {
      return record
    }

    const shown = shownByGroup.get(record.name)
    return shown === undefined ? [] : { ...record, ...summarizeGroup(shown) }
  })
}
