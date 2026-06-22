import type {
  HZDRHDF5Dataset,
  HZDRDatasetKind,
  HZDRDatasetOption,
  SelectOption,
  SelectOptionGroup,
} from '../types'

export function buildHdf5DatasetOptions(
  datasets: HZDRHDF5Dataset[],
  contextScope: string
): HZDRDatasetOption[] {
  const byShotOptions = new Map<string, HZDRDatasetOption>()
  const directOptions: HZDRDatasetOption[] = []

  for (const dataset of datasets) {
    const templateName = hdf5PerShotTemplateName(dataset.name)
    const kind = classifyHdf5Dataset(dataset)

    if (contextScope === 'shot' && templateName) {
      byShotOptions.set(templateName, {
        value: `hdf5:${templateName}`,
        label: `${dataset.name.split('/').at(-1)} (${dataset.dtype}, ${formatShape(dataset.shape)})`,
        name: templateName,
        previewName: dataset.name,
        dtype: dataset.dtype,
        shape: dataset.shape,
        kind,
        group: hdf5DatasetGroupLabel(kind, true),
      })
      continue
    }

    if (contextScope === 'shot' && isShotIndexedAggregateDataset(dataset)) {
      continue
    }

    if (contextScope === 'set' && templateName) {
      continue
    }

    directOptions.push({
      value: `hdf5:${dataset.name}`,
      label: `${dataset.name} (${dataset.dtype}, ${formatShape(dataset.shape)})`,
      name: dataset.name,
      previewName: dataset.name,
      dtype: dataset.dtype,
      shape: dataset.shape,
      kind,
      group: hdf5DatasetGroupLabel(
        contextScope === 'set' && isShotIndexedAggregateDataset(dataset)
          ? 'stack'
          : kind,
        false
      ),
    })
  }

  return [...byShotOptions.values(), ...directOptions]
}

export function groupHdf5DatasetOptions(
  datasetOptions: HZDRDatasetOption[]
): SelectOptionGroup[] {
  const grouped = new Map<string, HZDRDatasetOption[]>()
  for (const option of datasetOptions) {
    grouped.set(option.group, [...(grouped.get(option.group) ?? []), option])
  }
  return [...grouped.entries()].map(([group, items]) => ({
    group,
    items: items.map((item) => ({ value: item.value, label: item.label })),
  }))
}

export function getContextInputOptions({
  fieldKind,
  metadataOptions,
  datasetOptions,
}: {
  fieldKind: string
  metadataOptions: SelectOption[]
  datasetOptions: HZDRDatasetOption[]
}): SelectOptionGroup[] {
  const compatibleDatasetOptions =
    fieldKind === 'function'
      ? datasetOptions
      : datasetOptions.filter((option) => option.kind !== 'raw')

  return [
    { group: 'Shot metadata', items: metadataOptions },
    ...groupHdf5DatasetOptions(compatibleDatasetOptions),
  ].filter((group) => group.items.length)
}

export function classifyHdf5Dataset(dataset: HZDRHDF5Dataset): HZDRDatasetKind {
  const numeric = isNumericHdf5Dtype(dataset.dtype)
  const shape = dataset.shape

  if (!shape.length || (shape.length === 1 && Number(shape[0]) === 1)) {
    return numeric ? 'scalar' : 'raw'
  }

  if (shape.length === 1) {
    return numeric ? 'line' : 'raw'
  }

  if (shape.length === 2) {
    return numeric ? 'image' : 'raw'
  }

  if (shape.length > 2) {
    return numeric ? 'stack' : 'raw'
  }

  return 'raw'
}

export function hdf5DatasetGroupLabel(kind: HZDRDatasetKind, perShot: boolean) {
  const prefix = perShot ? 'HDF5 per-shot ' : 'HDF5 '
  if (kind === 'scalar') {
    return `${prefix}scalars`
  }
  if (kind === 'line') {
    return `${prefix}lineouts`
  }
  if (kind === 'image') {
    return `${prefix}images and masks`
  }
  if (kind === 'stack') {
    return `${prefix}shot-set stacks`
  }
  return `${prefix}raw datasets`
}

export function isShotIndexedAggregateDataset(dataset: HZDRHDF5Dataset) {
  return (
    dataset.name.endsWith('_by_shot') ||
    dataset.name.includes('_by_shot/') ||
    dataset.name.includes('/by_shot_')
  )
}

export function isNumericHdf5Dtype(dtype: string) {
  const normalized = dtype.toLowerCase()

  return (
    normalized.includes('float') ||
    normalized.includes('double') ||
    normalized.includes('int') ||
    normalized.includes('uint') ||
    /^[<>|]?[fiu]\d+$/.test(normalized)
  )
}

export function hdf5PerShotTemplateName(datasetName: string) {
  const patterns = [
    /^(.*\/by_shot\/)([^/]+)(\/.+)$/,
    /^(.*\/shots\/)([^/]+)(\/.+)$/,
    /^(.*\/shot\/)([^/]+)(\/.+)$/,
  ]

  for (const pattern of patterns) {
    const match = datasetName.match(pattern)
    if (match) {
      const [, prefix, , suffix] = match
      return `${prefix}{shot_id}${suffix}`
    }
  }

  return null
}

export function formatShape(shape: Array<number | string>) {
  return shape.length ? shape.join('x') : 'scalar'
}

export function getContextRecipeOptionHelp(
  fieldKind: string,
  contextScope: string
) {
  if (fieldKind === 'metadata') {
    return contextScope === 'set'
      ? 'Trends numeric metadata across the visible shots.'
      : 'Shows the selected metadata value directly in the table.'
  }
  if (fieldKind === 'hdf5') {
    return 'Reads the selected HDF5 dataset and stores a compact numeric summary.'
  }
  if (fieldKind === 'lineout-preview') {
    return (
      'Stores a 1D lineout, shows a summary in the table, and expands ' +
      'the line in the cell panel.'
    )
  }
  if (fieldKind === 'image-preview') {
    return (
      'Stores a 2D image, shows a summary in the table, and expands a ' +
      'reduced image in the cell panel.'
    )
  }
  if (fieldKind === 'plotly-trend') {
    return 'Builds an interactive Plotly preview from a 1D HDF5 dataset.'
  }
  if (fieldKind === 'mongo-filter') {
    return 'Uses the selected metadata field from a Mongo-style lookup result.'
  }
  return 'Combines one or more selected inputs with a custom Python expression.'
}

export function getContextRecipeOptions({
  contextScope,
  selectedInputs,
  datasetOptions,
}: {
  contextScope: string
  selectedInputs: string[]
  datasetOptions: HZDRDatasetOption[]
}) {
  const selectedDatasets = selectedInputs
    .filter((value) => value.startsWith('hdf5:'))
    .map((value) => datasetOptions.find((option) => option.value === value))
    .filter((option): option is HZDRDatasetOption => option !== undefined)
  const metadataCount = selectedInputs.filter((value) =>
    value.startsWith('metadata:')
  ).length
  const datasetCount = selectedDatasets.length
  const selectedCount = selectedInputs.length
  const singleDataset = selectedDatasets[0]
  const options: { value: string; label: string; disabled?: boolean }[] = []

  if (!selectedCount) {
    return [
      {
        value: 'metadata',
        label: 'Choose data first',
        disabled: true,
      },
    ]
  }

  if (selectedCount === 1 && metadataCount === 1) {
    options.push({
      value: 'metadata',
      label:
        contextScope === 'set'
          ? 'Trend selected metadata'
          : 'Show selected metadata',
    })
    if (contextScope === 'shot') {
      options.push({
        value: 'mongo-filter',
        label: 'Show results from a query',
      })
    }
  }

  if (
    selectedCount === 1 &&
    datasetCount === 1 &&
    singleDataset?.kind !== 'raw'
  ) {
    options.push({
      value: 'hdf5',
      label:
        contextScope === 'set'
          ? 'Summarize selected data across shots'
          : 'Summarize selected data',
    })
    if (contextScope === 'shot' && singleDataset.kind === 'line') {
      options.push(
        { value: 'lineout-preview', label: 'Lineout with table preview' },
        { value: 'plotly-trend', label: 'Interactive trend preview' }
      )
    }
    if (contextScope === 'shot' && singleDataset.kind === 'image') {
      options.push({
        value: 'image-preview',
        label: 'Image with reduced preview',
      })
    }
  }

  options.push({
    value: 'function',
    label:
      selectedCount > 1
        ? 'Compute with selected inputs'
        : 'Compute with a custom function',
  })

  return options
}

export function contextRecipeTone(fieldKind: string) {
  if (fieldKind === 'metadata') {
    return 'blue'
  }
  if (
    ['hdf5', 'lineout-preview', 'image-preview', 'plotly-trend'].includes(
      fieldKind
    )
  ) {
    return 'teal'
  }
  if (fieldKind === 'mongo-filter') {
    return 'yellow'
  }
  return 'violet'
}

export function contextRecipeLabel(fieldKind: string) {
  if (fieldKind === 'metadata') {
    return 'Metadata value'
  }
  if (fieldKind === 'hdf5') {
    return 'HDF5 summary'
  }
  if (fieldKind === 'lineout-preview') {
    return 'Lineout preview'
  }
  if (fieldKind === 'image-preview') {
    return 'Image preview'
  }
  if (fieldKind === 'plotly-trend') {
    return 'Plotly preview'
  }
  if (fieldKind === 'mongo-filter') {
    return 'Mongo query'
  }
  return 'Custom function'
}
