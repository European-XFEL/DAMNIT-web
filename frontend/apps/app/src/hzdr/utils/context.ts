import type {
  ContextVariableBlock,
  ContextBuilderFormState,
  SelectOption,
  SelectOptionGroup,
} from '../types'

export function splitPythonImportBlock(content: string) {
  const imports: string[] = []
  const bodyLines: string[] = []
  let inLeadingImports = true

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    const isImportLine =
      /^import\s+\S+/.test(trimmed) || /^from\s+\S+\s+import\s+/.test(trimmed)
    if (inLeadingImports && (isImportLine || trimmed === '')) {
      if (isImportLine) {
        imports.push(trimmed)
      }
      continue
    }
    inLeadingImports = false
    bodyLines.push(line)
  }

  return {
    imports,
    body: bodyLines.join('\n').trimStart(),
  }
}

export function mergeImportsAtTop(content: string, imports: string[]) {
  const missingImports = imports.filter(
    (importLine) => !pythonImportAlreadyCovered(content, importLine)
  )
  if (!missingImports.length) {
    return content
  }

  const insertionIndex = getPythonImportInsertionIndex(content)
  const before = content.slice(0, insertionIndex).trimEnd()
  const after = content.slice(insertionIndex).trimStart()
  const importBlock = missingImports.join('\n')
  return `${before}\n\n${importBlock}\n\n${after}`.trimStart()
}

export function stripDuplicateSnippetImports(
  snippet: string,
  contextContent: string
) {
  const { imports, body } = splitPythonImportBlock(snippet)
  const newImports = imports.filter(
    (importLine) => !pythonImportAlreadyCovered(contextContent, importLine)
  )
  return `${newImports.length ? `${newImports.join('\n')}\n\n` : ''}${body}`
}

export function pythonImportAlreadyCovered(
  content: string,
  importLine: string
) {
  const trimmedImport = importLine.trim()
  if (content.split('\n').some((line) => line.trim() === trimmedImport)) {
    return true
  }

  const fromImportMatch = trimmedImport.match(/^from\s+(\S+)\s+import\s+(.+)$/)
  if (!fromImportMatch) {
    return false
  }

  const [, moduleName, requiredNamesText] = fromImportMatch
  const requiredNames = parsePythonImportNames(requiredNamesText)
  return content.split('\n').some((line) => {
    const existingMatch = line.trim().match(/^from\s+(\S+)\s+import\s+(.+)$/)
    if (!existingMatch || existingMatch[1] !== moduleName) {
      return false
    }
    const existingNames = parsePythonImportNames(existingMatch[2])
    return (
      existingNames.includes('*') ||
      requiredNames.every((name) => existingNames.includes(name))
    )
  })
}

export function parsePythonImportNames(namesText: string) {
  return namesText
    .replace(/[()]/g, '')
    .split(',')
    .map((name) => name.trim().split(/\s+as\s+/)[0])
    .filter(Boolean)
}

export function getPythonImportInsertionIndex(content: string) {
  const trimmedStart = content.trimStart()
  const leadingWhitespace = content.length - trimmedStart.length
  const quote = trimmedStart.startsWith('"""')
    ? '"""'
    : trimmedStart.startsWith("'''")
      ? "'''"
      : ''
  if (!quote) {
    return 0
  }
  const docstringEnd = trimmedStart.indexOf(quote, quote.length)
  if (docstringEnd < 0) {
    return 0
  }
  return leadingWhitespace + docstringEnd + quote.length
}

export function parseContextVariableBlocks(
  content: unknown
): ContextVariableBlock[] {
  if (typeof content !== 'string' || !content.trim()) {
    return []
  }
  const matches = [
    ...content.matchAll(/@Variable\(([\s\S]*?)\)\s*\ndef\s+([A-Za-z_]\w*)/g),
  ]
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? content.length
    const titleMatch = match[1].match(/title\s*=\s*["']([^"']+)["']/)
    const name = match[2]
    return {
      id: name,
      name,
      title: titleMatch?.[1] ?? name,
      start,
      end,
      block: content.slice(start, end),
    }
  })
}

export function inferContextBuilderFormState(
  block: ContextVariableBlock
): ContextBuilderFormState {
  const metadataKey = extractPythonDocGetKey(block.block)
  const datasetName = extractPythonHdf5DatasetName(block.block)
  const selectedInputs = [
    metadataKey ? `metadata:${metadataKey}` : undefined,
    datasetName ? `hdf5:${datasetName}` : undefined,
  ].filter((input): input is string => Boolean(input))
  const fieldKind = inferContextBuilderFieldKind(block.block)
  const mongoFilter = extractPythonMongoFilter(block.block)
  const combineExpression =
    fieldKind === 'function'
      ? extractPythonReturnExpression(block.block)
      : undefined

  return {
    contextScope: block.block.includes('trendable shot-set') ? 'set' : 'shot',
    fieldKind,
    fieldName: block.name,
    fieldTitle: block.title,
    selectedInputs,
    allowMultipleInputs: selectedInputs.length > 1,
    mongoCollection: extractPythonMongoCollection(block.block),
    mongoFilter,
    combineExpression,
  }
}

export function inferContextBuilderFieldKind(block: string) {
  if (/\bhdf5_values\b/.test(block) && /\bmetadata_value\b/.test(block)) {
    return 'function'
  }
  if (/preview\s*=\s*fig\b/.test(block) || /\bpx\.line\b/.test(block)) {
    return 'plotly-trend'
  }
  if (/preview\s*=\s*image\b/.test(block)) {
    return 'image-preview'
  }
  if (/preview\s*=\s*lineout\b/.test(block)) {
    return 'lineout-preview'
  }
  if (/\bh5py\.File\b/.test(block)) {
    return 'hdf5'
  }
  if (/^\s*query\s*=/m.test(block)) {
    return 'mongo-filter'
  }
  if (/\bmongo_find_one\b/.test(block)) {
    return 'metadata'
  }
  return 'function'
}

export function extractPythonDocGetKey(block: string) {
  return block.match(/doc\.get\(\s*(["'])(.*?)\1\s*\)/)?.[2]
}

export function extractPythonHdf5DatasetName(block: string) {
  return (
    block.match(/dataset_name\s*=\s*f?(["'])(.*?)\1/)?.[2] ??
    block.match(/handle\[\s*(["'])(.*?)\1\s*\]/)?.[2]
  )
}

export function extractPythonMongoCollection(block: string) {
  return block.match(/mongo_find_one\(\s*(["'])(.*?)\1/)?.[2]
}

export function extractPythonMongoFilter(block: string) {
  const queryAssignment = block.match(
    /^\s*query\s*=\s*([\s\S]*?)\n\s*doc\s*=\s*mongo_find_one/m
  )
  if (queryAssignment?.[1]) {
    return queryAssignment[1].trim()
  }
  const keywordQuery = block.match(/query\s*=\s*([\s\S]*?)\n\s*\)/)
  return keywordQuery?.[1]?.replace(/,\s*$/, '').trim()
}

export function extractPythonReturnExpression(block: string) {
  const returns = [...block.matchAll(/^\s*return\s+(.+)$/gm)]
  return returns.at(-1)?.[1]?.trim()
}

export function extractPythonFunctionName(block: string) {
  const name = block.match(/def\s+([A-Za-z_]\w*)\s*\(/)?.[1]
  return name && isValidPythonFunctionName(name) ? name : undefined
}

export function isValidPythonFunctionName(name: string) {
  return /^[A-Za-z_]\w*$/.test(name) && !PYTHON_RESERVED_NAMES.has(name)
}

export function pythonNameFromTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const safeSlug = slug || 'hzdr_computed_field'
  const identifier = /^[a-z_]/.test(safeSlug) ? safeSlug : `field_${safeSlug}`
  return PYTHON_RESERVED_NAMES.has(identifier)
    ? `field_${identifier}`
    : identifier
}

export function repairCommonContextImports(content: string) {
  const imports: string[] = []
  if (/\bh5py\b/.test(content) && !/^\s*import\s+h5py\b/m.test(content)) {
    imports.push('import h5py')
  }
  if (
    /\bnp\./.test(content) &&
    !/^\s*import\s+numpy\s+as\s+np\b/m.test(content)
  ) {
    imports.push('import numpy as np')
  }
  if (
    /\bpx\./.test(content) &&
    !/^\s*import\s+plotly\.express\s+as\s+px\b/m.test(content)
  ) {
    imports.push('import plotly.express as px')
  }
  const damnitNames = ['Cell', 'Skip', 'Variable', 'mongo_find_one'].filter(
    (name) => new RegExp(`\\b${name}\\b`).test(content)
  )
  if (
    damnitNames.length &&
    !/^\s*from\s+damnit_ctx\s+import\s+/m.test(content)
  ) {
    imports.push(`from damnit_ctx import ${damnitNames.join(', ')}`)
  }
  if (!imports.length) {
    return content
  }
  return `${imports.join('\n')}\n\n${content.trimStart()}`
}

export function buildComputedFieldSnippet({
  fieldKind,
  contextScope,
  fieldName,
  fieldTitle,
  selectedInputs,
  mongoCollection,
  mongoFilter,
  combineExpression,
}: {
  fieldKind: string
  contextScope: string
  fieldName: string
  fieldTitle: string
  selectedInputs: string[]
  mongoCollection: string
  mongoFilter: string
  combineExpression: string
}) {
  const safeFieldName = fieldName.trim() || 'hzdr_computed_field'
  const safeFieldTitle = fieldTitle.trim() || 'HZDR/Computed field'
  const metadataKey =
    selectedInputs.find((value) => value.startsWith('metadata:'))?.slice(9) ??
    'status'
  const datasetName =
    selectedInputs.find((value) => value.startsWith('hdf5:'))?.slice(5) ??
    'signal'
  const hdf5ShotIdParameter = pythonShotIdParameter(datasetName)
  const hdf5DatasetExpression = pythonHdf5DatasetExpression(datasetName)
  const safeMongoCollection = mongoCollection.trim() || 'shots'

  if (fieldKind === 'metadata') {
    return `from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)})
def ${safeFieldName}(run, shot_number: "meta#shot_number"):
    """Return a ${contextScope === 'set' ? 'trendable shot-set' : 'per-shot'} metadata value."""
    doc = mongo_find_one("shots", query={"shot_number": shot_number})
    if doc is None:
        raise Skip("No shot metadata document")
    value = doc.get(${JSON.stringify(metadataKey)})
    if value is None:
        raise Skip("No ${metadataKey} metadata for this shot")
    return value
`
  }

  if (fieldKind === 'hdf5') {
    return `import h5py
import numpy as np

from damnit_ctx import Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        values = handle[dataset_name][...]
    return float(np.nanmean(values))
`
  }

  if (fieldKind === 'lineout-preview') {
    return `import h5py
import numpy as np

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Show a scalar summary in the table and the full lineout in the preview."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        lineout = np.asarray(handle[dataset_name][...])
    return Cell(lineout, summary="nanmean", preview=lineout)
`
  }

  if (fieldKind === 'image-preview') {
    return `import h5py
import numpy as np

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Show a scalar summary in the table and a reduced image in the preview."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        image = np.asarray(handle[dataset_name][...])
    return Cell(image, summary="nanmean", preview=image[::8, ::8])
`
  }

  if (fieldKind === 'plotly-trend') {
    return `import h5py
import numpy as np
import plotly.express as px

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Use a Plotly figure as the double-click preview for a lineout."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        values = np.asarray(handle[dataset_name][...])
    fig = px.line(x=np.arange(values.size), y=values, labels={"x": "Index", "y": "Signal"})
    return Cell(values, summary="nanmean", preview=fig)
`
  }

  if (fieldKind === 'mongo-filter') {
    return `from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)})
def ${safeFieldName}(run, shot_number: "meta#shot_number"):
    query = ${mongoFilter}
    doc = mongo_find_one(${JSON.stringify(safeMongoCollection)}, query=query)
    if doc is None:
        raise Skip("No matching Mongo document")
    return doc.get(${JSON.stringify(metadataKey)})
`
  }

  if (fieldKind === 'function') {
    return `import h5py
import numpy as np

from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, shot_number: "meta#shot_number", hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Compute this column from selected HZDR inputs."""
    doc = mongo_find_one(
        ${JSON.stringify(safeMongoCollection)},
        query=${mongoFilter},
    )
    if doc is None or not hdf5_path:
        raise Skip("Missing Mongo metadata or HDF5 path")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        hdf5_values = handle[dataset_name][...]
    metadata_value = doc.get(${JSON.stringify(metadataKey)})
    return ${combineExpression || 'np.nanmean(hdf5_values)'}
`
  }

  return `from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)})
def ${safeFieldName}(run, shot_number: "meta#shot_number"):
    doc = mongo_find_one(
        ${JSON.stringify(safeMongoCollection)},
        query=${mongoFilter},
    )
    if doc is None:
        raise Skip("No matching Mongo document")
    return doc.get(${JSON.stringify(metadataKey)})
`
}

export function makeContextVariableBlockUnique(
  block: string,
  existingBlocks: ContextVariableBlock[]
) {
  const currentName = extractPythonFunctionName(block)
  if (!currentName) {
    return block
  }
  const existingNames = new Set(existingBlocks.map((entry) => entry.name))
  if (!existingNames.has(currentName)) {
    return block
  }

  const baseName = currentName.replace(/_\d+$/, '')
  let suffix = 2
  let nextName = `${baseName}_${suffix}`
  while (existingNames.has(nextName)) {
    suffix += 1
    nextName = `${baseName}_${suffix}`
  }

  const renamedBlock = block.replace(
    new RegExp(`def\\s+${escapeRegExp(currentName)}\\s*\\(`),
    `def ${nextName}(`
  )
  const titleMatch = renamedBlock.match(/title\s*=\s*(["'])(.*?)\1/)
  if (!titleMatch) {
    return renamedBlock
  }
  const existingTitles = new Set(existingBlocks.map((entry) => entry.title))
  const currentTitle = titleMatch[2]
  const nextTitle = existingTitles.has(currentTitle)
    ? `${currentTitle} ${suffix}`
    : currentTitle
  return renamedBlock.replace(
    /title\s*=\s*(["'])(.*?)\1/,
    `title=${JSON.stringify(nextTitle)}`
  )
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getContextRecipeInputValues(
  options: Array<SelectOption | SelectOptionGroup>
) {
  return options.flatMap((option) =>
    'items' in option ? option.items.map((item) => item.value) : option.value
  )
}

export function pythonShotIdParameter(datasetName: string) {
  return datasetName.includes('{shot_id}') ? ', shot_id: "meta#shot_id"' : ''
}

export function pythonHdf5DatasetExpression(datasetName: string) {
  if (!datasetName.includes('{shot_id}')) {
    return JSON.stringify(datasetName)
  }
  return `f${JSON.stringify(datasetName)}`
}

const PYTHON_RESERVED_NAMES = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])
