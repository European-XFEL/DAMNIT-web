import type { HZDRDataProduct } from '../types'

import { hdf5PerShotTemplateName } from './hdf5'

const PREVIEW_KINDS = ['scalar', 'line', 'image']

function kindFromShape(shape: Array<number | string>) {
  if (!shape.length || (shape.length === 1 && Number(shape[0]) === 1)) {
    return 'scalar'
  }
  if (shape.length === 1) return 'line'
  if (shape.length === 2) return 'image'
  return 'stack'
}

function fileName(path: string) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? ''
}

/**
 * Whether a product lives in the campaign file: no separate `path`, or the
 * campaign file's own (the builder records an in-file product's path as the
 * file it wrote, maybe under another host's mount, hence the name check).
 */
function isInCampaignFile(
  path: string | null | undefined,
  campaignFile?: string | null
) {
  if (!path) return true
  if (!campaignFile) return false
  return path === campaignFile || fileName(path) === fileName(campaignFile)
}

/**
 * The campaign-file dataset a data product can be previewed from, without
 * the leading slash, or undefined. Only products written into the campaign
 * file itself (`campaignFile`, the shot's `hdf5_path`) as a scalar, line or
 * image; a LabFrog shot-indexed table holds every shot, so a preview would
 * not be this shot's.
 */
export function previewableProductDataset(
  product: HZDRDataProduct,
  campaignFile?: string | null
): string | undefined {
  if (!product.dataset_name || !isInCampaignFile(product.path, campaignFile))
    return undefined
  if (product.metadata?.shot_indexed === true) return undefined
  const kind = product.preview_kind ?? kindFromShape(product.shape ?? [])
  if (!PREVIEW_KINDS.includes(kind)) return undefined
  return product.dataset_name.replace(/^\/+/, '') || undefined
}

/**
 * Context Builder, opened with this HDF5 dataset as the column's input, or
 * undefined when the dataset cannot become a column. A column reads the same
 * path on every shot, so only a dataset the builder can generalise (one under
 * `by_shot/`, `shots/` or `shot/<id>/`, see hdf5PerShotTemplateName) is
 * offered; an event's values or a container path name one shot, and a column
 * of them would repeat that shot's value in every row. The link carries the
 * per-shot template and the shot (`&shot=`) as the builder's example shot:
 * `?add=hdf5:<template>&shot=<shot key>`, with `:`, `/` and braces readable.
 */
export function shotAddColumnPath(
  sourceKey: string,
  datasetName: string,
  shotKey?: string | null
): string | undefined {
  const template = hdf5PerShotTemplateName(datasetName)
  if (!template) return undefined
  const params = new URLSearchParams({ add: `hdf5:${template}` })
  if (shotKey) params.set('shot', shotKey)
  const query = params
    .toString()
    .replace(/%3A|%2F|%7B|%7D/gi, (code) => decodeURIComponent(code))
  return `/source/${sourceKey}/context-builder?${query}`
}
