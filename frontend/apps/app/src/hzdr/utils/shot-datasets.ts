import type { HZDRHDF5Dataset, HZDRShot } from '../types'

import { getShotDateKey } from './shot-key'

/**
 * Which datasets of a campaign file belong to one shot. The API lists every
 * dataset of the campaign file (and the shot's container under its stem) in
 * `hdf5_datasets`; Context Builder needs all of them, so the shot's own are
 * picked out here, by the names the builder and the container worker write:
 *
 * - the shot's container, `<YYYYMMDD>_<shot_number:06d>/...` (from the
 *   `shot_key`, or the detail's `container`);
 * - an event's values, `entry/<source>/<kind>/<event_id>/values`, for each
 *   event linked to the shot, and each data product's own dataset;
 * - the `shot_key` itself, raw or with the characters HDF5 names drop;
 * - only when no event id matched: the shot's `shot_id` and its
 *   `shot-<NNNNNN>` token (the emulator's event ids carry them), which can
 *   repeat across days when the counter restarts.
 *
 * Every token must stand alone: `shot-000007` does not match `shot-0000070`.
 */
export type ShotDatasetShot = Pick<
  HZDRShot,
  'shot_number' | 'fired_at' | 'shot_key' | 'shot_date' | 'metadata'
> &
  Partial<Pick<HZDRShot, 'events' | 'data_products'>>

const pad6 = (value: number) => String(Math.trunc(value)).padStart(6, '0')

/** HDF5 names keep only these characters (hzdr_nexus.safe_hdf5_name). */
export function safeHdf5Name(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]+/g, '_') || 'unnamed'
}

/** `20260701_000007`: the shot's container file without `.nxs`. */
export function shotContainerStem(shot: ShotDatasetShot): string | undefined {
  const fromKey = /:(\d{4})-?(\d{2})-?(\d{2}):(\d+)$/.exec(shot.shot_key ?? '')
  if (fromKey) {
    return `${fromKey[1]}${fromKey[2]}${fromKey[3]}_${pad6(Number(fromKey[4]))}`
  }
  if (shot.shot_key) {
    return undefined
  }
  const day = (shot.shot_date || getShotDateKey(shot.fired_at))?.replace(
    /-/g,
    ''
  )
  return day && /^\d{8}$/.test(day)
    ? `${day}_${pad6(shot.shot_number)}`
    : undefined
}

const ALNUM = /[A-Za-z0-9]/

/** Whether `token` appears in `name` with no letter or digit on either side. */
export function containsToken(name: string, token: string) {
  if (!token) {
    return false
  }
  let index = name.indexOf(token)
  while (index !== -1) {
    const before = index === 0 ? '' : name[index - 1]
    const after = name[index + token.length] ?? ''
    if (!ALNUM.test(before) && !ALNUM.test(after)) {
      return true
    }
    index = name.indexOf(token, index + 1)
  }
  return false
}

const stripSlash = (name: string) => name.replace(/^\/+/, '')

function strongTokens(shot: ShotDatasetShot, container?: string | null) {
  const tokens = new Set<string>()
  const stem = shotContainerStem(shot)
  if (stem) tokens.add(stem)
  if (container) tokens.add(stripSlash(container))
  if (shot.shot_key) {
    tokens.add(shot.shot_key)
    tokens.add(safeHdf5Name(shot.shot_key))
  }
  return tokens
}

function eventTokens(shot: ShotDatasetShot) {
  const tokens = new Set<string>()
  for (const event of shot.events ?? []) {
    if (event.event_id) tokens.add(safeHdf5Name(event.event_id))
  }
  return tokens
}

function productNames(shot: ShotDatasetShot) {
  return new Set(
    (shot.data_products ?? [])
      .filter((product) => !product.path && product.dataset_name)
      .map((product) => stripSlash(String(product.dataset_name)))
  )
}

function weakTokens(shot: ShotDatasetShot) {
  const tokens = new Set<string>([`shot-${pad6(shot.shot_number)}`])
  const shotId = shot.metadata.shot_id
  // A bare count ("7") would match any index in a path: only ids that name
  // themselves ("shot-000007", "draco-0007") are used.
  if (
    typeof shotId === 'string' &&
    shotId.length >= 4 &&
    !/^\d+$/.test(shotId)
  ) {
    tokens.add(shotId)
  }
  return tokens
}

const matchesAny = (name: string, tokens: Set<string>) =>
  [...tokens].some((token) => containsToken(name, token))

/** Split a campaign file's datasets into this shot's and the rest. */
export function splitShotDatasets<T extends Pick<HZDRHDF5Dataset, 'name'>>(
  shot: ShotDatasetShot,
  datasets: T[],
  container?: string | null
): { shot: T[]; rest: T[] } {
  const strong = strongTokens(shot, container)
  const events = eventTokens(shot)
  const products = productNames(shot)
  const own = new Set<T>()
  let identified = false
  for (const dataset of datasets) {
    const name = stripSlash(dataset.name)
    if (matchesAny(name, events)) {
      own.add(dataset)
      identified = true
    } else if (products.has(name) || matchesAny(name, strong)) {
      own.add(dataset)
    }
  }
  if (!identified) {
    const weak = weakTokens(shot)
    for (const dataset of datasets) {
      if (matchesAny(stripSlash(dataset.name), weak)) own.add(dataset)
    }
  }
  return {
    shot: datasets.filter((dataset) => own.has(dataset)),
    rest: datasets.filter((dataset) => !own.has(dataset)),
  }
}

/** One folder or dataset of a dataset tree. */
export type ShotDatasetNode<T> = {
  /** The node's label: one path segment, or several for a folded chain. */
  label: string
  /** The full path of the node. */
  path: string
  dataset?: T
  children: ShotDatasetNode<T>[]
}

/**
 * Datasets as folders by path segment, sorted folders first. A folder whose
 * only child is another folder is shown as one ("entry/laserdata").
 */
export function buildShotDatasetTree<T extends Pick<HZDRHDF5Dataset, 'name'>>(
  datasets: T[]
): ShotDatasetNode<T>[] {
  const root: ShotDatasetNode<T> = { label: '', path: '', children: [] }
  for (const dataset of datasets) {
    const parts = stripSlash(dataset.name).split('/').filter(Boolean)
    let node = root
    parts.forEach((part, index) => {
      const path = node.path ? `${node.path}/${part}` : part
      const leaf = index === parts.length - 1
      let child = node.children.find(
        (entry) => entry.label === part && !entry.dataset === !leaf
      )
      if (!child) {
        child = { label: part, path, children: [] }
        node.children.push(child)
      }
      if (leaf) child.dataset = dataset
      node = child
    })
  }
  const sortNodes = (nodes: ShotDatasetNode<T>[]) =>
    nodes.sort(
      (left, right) =>
        Number(Boolean(left.dataset)) - Number(Boolean(right.dataset)) ||
        left.label.localeCompare(right.label, undefined, { numeric: true })
    )
  const fold = (node: ShotDatasetNode<T>): ShotDatasetNode<T> => {
    let current = node
    while (
      !current.dataset &&
      current.children.length === 1 &&
      !current.children[0].dataset
    ) {
      const only = current.children[0]
      current = {
        label: `${current.label}/${only.label}`,
        path: only.path,
        children: only.children,
      }
    }
    return { ...current, children: sortNodes(current.children.map(fold)) }
  }
  return sortNodes(root.children.map(fold))
}

/** How many datasets a tree node holds. */
export function countShotDatasets<T>(node: ShotDatasetNode<T>): number {
  return (
    (node.dataset ? 1 : 0) +
    node.children.reduce((total, child) => total + countShotDatasets(child), 0)
  )
}
