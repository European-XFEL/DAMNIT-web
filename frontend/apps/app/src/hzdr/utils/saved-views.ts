import type { ShotTableView } from './table-view'
import { parseShotTableView } from './table-view'
import { requireJson } from './api'

/** One named table view as GET .../sources/{key}/views returns it. */
export type SavedTableView = {
  id: string
  name: string
  view: ShotTableView
}

type SavedViewRecord = {
  id: string
  name: string
  kind?: string
  state?: unknown
}

const viewsPath = (sourceKey: string) =>
  `/metadata/hzdr/sources/${encodeURIComponent(sourceKey)}/views`

/** This user's named table views for a campaign; malformed ones are left out. */
export async function fetchSavedTableViews(
  sourceKey: string
): Promise<SavedTableView[]> {
  const records = await requireJson<SavedViewRecord[]>(
    await fetch(viewsPath(sourceKey))
  )
  return records.flatMap((record) => {
    if ((record.kind ?? 'table') !== 'table') return []
    const view = parseShotTableView(record.state)
    return view ? [{ id: record.id, name: record.name, view }] : []
  })
}

/** Save (or replace, by name) a named table view. */
export async function saveTableView(
  sourceKey: string,
  name: string,
  view: ShotTableView
): Promise<SavedTableView> {
  const record = await requireJson<SavedViewRecord>(
    await fetch(viewsPath(sourceKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kind: 'table', state: view }),
    })
  )
  return { id: record.id, name: record.name, view }
}

export async function deleteTableView(sourceKey: string, id: string) {
  await requireJson(
    await fetch(`${viewsPath(sourceKey)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  )
}
