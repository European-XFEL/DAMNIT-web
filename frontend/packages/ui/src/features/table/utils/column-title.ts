import type { TableMeta } from '#src/data/table/table-data.types'

// The header title of a column, without the part its group header already
// shows. This removes a prefix rather than parsing the title again: the server
// took the group's title from this same title's first slash, so it either
// matches exactly or the group has no title to remove.
export function getColumnTitle(
  { title, group }: { title: string; group?: string },
  groups: TableMeta['groups']
): string {
  const groupTitle = group ? groups[group]?.title : undefined
  if (!groupTitle || !title.startsWith(`${groupTitle}/`)) {
    return title
  }

  // A title that is nothing but the group's words and the separator would strip
  // to an empty header, so keep it whole instead.
  return title.slice(groupTitle.length + 1) || title
}
