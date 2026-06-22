import type { HZDRDatasetOption, HZDRShot } from '../types'
import { getNestedMetadataValue } from './metadata'
import { formatSelectedInput } from './format'

export function buildColumnPreview({
  fieldKind,
  selectedInputs,
  selectedShot,
  datasetOptions,
  combineExpression,
}: {
  fieldKind: string
  selectedInputs: string[]
  selectedShot?: HZDRShot
  datasetOptions: HZDRDatasetOption[]
  combineExpression: string
}) {
  if (!selectedShot) {
    return 'No example shot selected.'
  }

  const metadataKey = selectedInputs
    .find((value) => value.startsWith('metadata:'))
    ?.slice(9)
  const datasetName = selectedInputs
    .find((value) => value.startsWith('hdf5:'))
    ?.slice(5)
  const metadataValue = metadataKey
    ? getNestedMetadataValue(selectedShot.metadata, metadataKey)
    : undefined
  const dataset = selectedInputs
    .map((value) => datasetOptions.find((option) => option.value === value))
    .find(Boolean)

  if (fieldKind === 'metadata') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        input: metadataKey ?? 'metadata key not selected',
        value: metadataValue ?? null,
      },
      null,
      2
    )
  }

  if (fieldKind === 'hdf5') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        displayed_value: 'nanmean(dataset)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'lineout-preview') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        preview: dataset ? `lineout(${dataset.name})` : null,
        displayed_value: 'nanmean(lineout)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'image-preview') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        preview: dataset ? `thumbnail(${dataset.name})` : null,
        displayed_value: 'nanmean(image)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'plotly-trend') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        preview: dataset ? `Plotly line(${dataset.name})` : null,
        displayed_value: 'nanmean(values)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'function') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        metadata_input: metadataKey ?? null,
        metadata_value: metadataValue ?? null,
        hdf5_dataset: datasetName ?? null,
        hdf5_shape: dataset?.shape ?? null,
        expression: combineExpression,
        value:
          metadataValue !== undefined && dataset
            ? `${combineExpression} -> computed at runtime`
            : null,
      },
      null,
      2
    )
  }

  return JSON.stringify(
    {
      shot_number: selectedShot.shot_number,
      mongo_query: 'uses the configured Mongo filter at runtime',
      selected_inputs: selectedInputs.map(formatSelectedInput),
      value: 'MongoDB field value at runtime',
    },
    null,
    2
  )
}

export function parseColumnDetails(
  columnDetails: string
): Record<string, unknown> {
  if (!columnDetails.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(columnDetails)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { value: parsed }
  } catch {
    return { value: columnDetails }
  }
}

export function isNumericLinePreview(preview: unknown): preview is number[] {
  return (
    Array.isArray(preview) &&
    preview.length > 1 &&
    preview.every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry)
    )
  )
}

export function isNumericMatrixPreview(
  preview: unknown
): preview is number[][] {
  return (
    Array.isArray(preview) &&
    preview.length > 0 &&
    preview.every(
      (row) =>
        Array.isArray(row) &&
        row.length > 0 &&
        row.every(
          (entry) => typeof entry === 'number' && Number.isFinite(entry)
        )
    )
  )
}
