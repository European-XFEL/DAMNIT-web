import type { ColumnSuggestion, HZDRDatasetOption, HZDRShot } from '../types'

import { campaignValues, formatPreviewNumber } from './columnPreview'
import {
  buildComputedFieldSnippet,
  extractPythonFunctionName,
  makeContextVariableBlockUnique,
  mergeImportsAtTop,
  parseContextVariableBlocks,
  pythonNameFromTitle,
  splitPythonImportBlock,
} from './context'
import { formatShape } from './hdf5'
import { metadataFieldLabel } from './metadata'

/** How many HDF5 datasets of the example shot are offered at most. */
export const MAX_DATASET_SUGGESTIONS = 8

const DATASET_DISPLAYS: Record<
  string,
  { display: string; displayLabel: string; displayHelp: string; what: string }
> = {
  image: {
    display: 'image-preview',
    displayLabel: 'Image preview',
    displayHelp:
      'Shows the mean of the image in each row; double-click a cell to see the image itself.',
    what: 'an image',
  },
  line: {
    display: 'lineout-preview',
    displayLabel: 'Lineout preview',
    displayHelp:
      'Shows the mean of the lineout in each row; double-click a cell to see the curve.',
    what: 'a lineout',
  },
  scalar: {
    display: 'hdf5',
    displayLabel: 'Number column',
    displayHelp: "Shows the stored number in each shot's row.",
    what: 'one number',
  },
}

/**
 * Datasets the campaign build writes to say which event, shot or container
 * goes with which: identifiers and counters, never a measurement. Offered as
 * columns they read as a "lineout" of indices or a column of `nan`
 * (Vanlife, 2026-11-23, where an instrument had nothing else yet).
 */
const BOOKKEEPING_DATASETS = new Set([
  'event_id',
  'event_ids',
  'event_index',
  'shot_key',
  'shot_id',
  'shot_number',
  'container',
  'source_key',
  'record_id',
])

/**
 * Identifiers, keys and row indices by their name: `experiment_id`,
 * `kafka_event_id`, `labfrog_record_id`, `shot_index`, `message_key`, ... The
 * campaign file holds dozens; listing them one by one let most through.
 */
const ID_LIKE = /(^|_)(id|ids|key|keys|index|uuid)$/i

/** Whether a dataset is bookkeeping by its last path segment. */
export function isBookkeepingDataset(name: string) {
  const last = name.split('/').filter(Boolean).at(-1) ?? ''
  return BOOKKEEPING_DATASETS.has(last) || ID_LIKE.test(last)
}

function datasetTitle(name: string) {
  const parts = name
    .replace(/\{shot_id\}/g, 'shot')
    .split('/')
    .filter(Boolean)
  const last = parts.at(-1) ?? name
  // A container's measurement is `<detector>/data/<leaf>`: every camera's is
  // `data/image`, so the detector names it.
  const at = parts.lastIndexOf('data')
  const label =
    at > 0 && at === parts.length - 2 ? `${parts[at - 1]} ${last}` : last
  const text = label.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Settings and file bookkeeping inside a container: listed, never first. */
const SECONDARY_SEGMENTS = new Set([
  'acquisition_settings',
  'file_metadata',
  'conversion_problems',
  'mapping_problems',
])

/**
 * The order suggestions are offered in: images, then lineouts, then numbers;
 * within each, a detector's measurement (`.../data/...`) before its settings
 * and file information. A Vanlife container holds 613 datasets, and in name
 * order the eight slots went to one camera's settings (2026-11-23).
 */
function suggestionRank(option: HZDRDatasetOption) {
  const parts = option.name.split('/').filter(Boolean)
  const kind = { image: 0, line: 1, scalar: 2 }[option.kind as string] ?? 3
  const secondary = parts.some((part) => SECONDARY_SEGMENTS.has(part)) ? 1 : 0
  const measured = parts.at(-2) === 'data' ? 0 : 1
  return [secondary, kind, measured] as const
}

function byRank(a: HZDRDatasetOption, b: HZDRDatasetOption) {
  const left = suggestionRank(a)
  const right = suggestionRank(b)
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

/**
 * Column suggestions for the example shot's HDF5 datasets: images become an
 * image preview, lineouts a lineout preview, scalars a number. Raw and
 * multi-shot stacks are left to the manual builder.
 */
export function datasetSuggestions(
  options: HZDRDatasetOption[],
  exampleLabel: string
): ColumnSuggestion[] {
  const suggestions: ColumnSuggestion[] = []
  const taken = new Set<string>()
  for (const option of [...options].sort(byRank)) {
    const recipe = DATASET_DISPLAYS[option.kind]
    if (!recipe || suggestions.length >= MAX_DATASET_SUGGESTIONS) continue
    if (isBookkeepingDataset(option.name)) continue
    const title = datasetTitle(option.name)
    let fieldName = pythonNameFromTitle(title) || 'dataset'
    for (let index = 2; taken.has(fieldName); index += 1) {
      fieldName = `${pythonNameFromTitle(title)}_${index}`
    }
    taken.add(fieldName)
    suggestions.push({
      id: `hdf5:${option.name}`,
      title,
      function: fieldName,
      origin: 'hdf5',
      originLabel: 'HDF5 dataset',
      field: option.name,
      path: option.name,
      previewName: option.previewName,
      type: option.kind,
      unit: '',
      count: 1,
      total: 1,
      examples: [],
      reason: `On the example shot (${exampleLabel}): ${recipe.what}, ${option.dtype} ${formatShape(option.shape)}, at ${option.previewName}.`,
      starter: false,
      block: buildComputedFieldSnippet({
        fieldKind: recipe.display,
        contextScope: 'shot',
        fieldName,
        fieldTitle: title,
        selectedInputs: [option.value],
        mongoCollection: 'shots',
        mongoFilter: '{}',
        combineExpression: '',
      }),
      display: recipe.display,
      displayLabel: recipe.displayLabel,
      displayHelp: recipe.displayHelp,
    })
  }
  return suggestions
}

/**
 * True when the context file already reads this suggestion's data: its path
 * (or, for a LabFrog name with a dot, the name) appears quoted in the file.
 * A column that merely shares the function name reads other data, so it
 * does not count; adding the suggestion renames its function instead.
 */
export function isAlreadyInContext(
  suggestion: ColumnSuggestion,
  contextContent: string
) {
  return [`"${suggestion.path}"`, `'${suggestion.path}'`].some((quoted) =>
    contextContent.includes(quoted)
  )
}

/** The builder form state that reproduces a suggestion, for Customise. */
export function suggestionFormState(suggestion: ColumnSuggestion) {
  if (suggestion.origin === 'hdf5') {
    return {
      fieldKind: suggestion.display,
      selectedInputs: [`hdf5:${suggestion.field}`],
      fieldTitle: suggestion.title,
    }
  }
  return {
    fieldKind: 'metadata',
    selectedInputs: [`metadata:${suggestion.field}`],
    fieldTitle: suggestion.title,
  }
}

const IGNORED_PREFIX = 'hzdr.contextAssist.ignored.'

/** The suggestions this browser was told to ignore for a campaign. */
export function loadIgnoredSuggestions(campaign: string): string[] {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`${IGNORED_PREFIX}${campaign}`) ?? '[]'
    ) as unknown
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export function saveIgnoredSuggestions(campaign: string, ids: string[]) {
  try {
    if (ids.length) {
      window.localStorage.setItem(
        `${IGNORED_PREFIX}${campaign}`,
        JSON.stringify(ids)
      )
    } else {
      window.localStorage.removeItem(`${IGNORED_PREFIX}${campaign}`)
    }
  } catch {
    // Private windows and blocked storage: ignoring lasts for this visit.
  }
}

const KIND_WORDS: Record<string, string> = {
  image: 'An image',
  line: 'A lineout',
  scalar: 'One number',
}

/**
 * A suggestion in one short line for its row: how many shots record it and
 * the range of its values ("16 of 16 shots · 0.836-0.924 nC"), or its labels;
 * for a dataset, what it holds on the example shot.
 */
export function suggestionSummary(
  suggestion: ColumnSuggestion,
  shots: HZDRShot[]
) {
  if (suggestion.origin === 'hdf5') {
    return `${KIND_WORDS[suggestion.type] ?? 'A dataset'} on the example shot`
  }
  const across = shots.length ? campaignValues(shots, suggestion.field) : null
  const recorded = across
    ? `${across.recorded} of ${across.total} shots`
    : `${suggestion.count} of ${suggestion.total} shots`
  if (!across?.recorded) {
    return suggestion.examples.length
      ? `${recorded} · e.g. ${suggestion.examples.slice(0, 3).join(', ')}`
      : recorded
  }
  const unit = suggestion.unit ? ` ${suggestion.unit}` : ''
  if (suggestion.type !== 'text' && across.numbers.length) {
    let low = Infinity
    let high = -Infinity
    for (const { value } of across.numbers) {
      if (value < low) low = value
      if (value > high) high = value
    }
    const range =
      low === high
        ? formatPreviewNumber(low)
        : `${formatPreviewNumber(low)}\u2013${formatPreviewNumber(high)}`
    return `${recorded} · ${range}${unit}`
  }
  const count = across.labels.length
  return `${recorded} · ${count} label${count === 1 ? '' : 's'}`
}

/**
 * Several suggestions appended to a context file in one go, the same way a
 * single Add does it: imports at the top, function names made unique. One
 * already read by the file (or by a block added before it) is skipped.
 */
export function appendSuggestionBlocks(
  contextContent: string,
  suggestions: ColumnSuggestion[]
) {
  let fileContent = contextContent
  const added: ColumnSuggestion[] = []
  const skipped: ColumnSuggestion[] = []
  for (const suggestion of suggestions) {
    const { imports, body } = splitPythonImportBlock(suggestion.block)
    if (
      isAlreadyInContext(suggestion, fileContent) ||
      !extractPythonFunctionName(body)
    ) {
      skipped.push(suggestion)
      continue
    }
    const uniqueBody = makeContextVariableBlockUnique(
      body,
      parseContextVariableBlocks(fileContent)
    )
    fileContent = `${mergeImportsAtTop(fileContent, imports).trimEnd()}\n\n${uniqueBody.trimEnd()}\n`
    added.push(suggestion)
  }
  return { fileContent, added, skipped }
}

/** The builder's display for a dataset kind, as its suggestion uses it. */
export function datasetDisplay(kind: string) {
  return DATASET_DISPLAYS[kind]?.display ?? 'hdf5'
}

/**
 * The builder form state for a deep link's input (`?add=`), in the format
 * the builder's own inputs use: `metadata:<path>` for a recorded field, or
 * `hdf5:<dataset>` for a dataset of the example shot, by its builder name or
 * its name in the file. Null when the campaign has no such input.
 */
export function inputFormState(
  input: string,
  {
    metadataKeys,
    datasetOptions,
  }: { metadataKeys: Set<string>; datasetOptions: HZDRDatasetOption[] }
) {
  if (input.startsWith('metadata:')) {
    const path = input.slice('metadata:'.length)
    if (!path || !metadataKeys.has(path)) return null
    return {
      fieldKind: 'metadata',
      selectedInputs: [input],
      fieldTitle: metadataFieldLabel(path),
    }
  }
  if (input.startsWith('hdf5:')) {
    const name = input.slice('hdf5:'.length).replace(/^\/+/, '')
    const option = datasetOptions.find(
      (candidate) =>
        candidate.value === `hdf5:${name}` ||
        candidate.previewName.replace(/^\/+/, '') === name
    )
    if (!name || !option) return null
    return {
      fieldKind: datasetDisplay(option.kind),
      selectedInputs: [option.value],
      fieldTitle: datasetTitle(option.name),
    }
  }
  return null
}
