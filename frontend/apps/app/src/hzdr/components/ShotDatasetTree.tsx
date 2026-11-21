import { useMemo, useState } from 'react'
import { Button, Group, Stack, Text, TextInput } from '@mantine/core'

import type { HZDRHDF5Dataset, HZDRShot } from '../types'
import {
  buildShotDatasetTree,
  countShotDatasets,
  splitShotDatasets,
  type ShotDatasetNode,
} from '../utils/shot-datasets'

function DatasetRow({
  dataset,
  label,
}: {
  dataset: HZDRHDF5Dataset
  label: string
}) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      gap="xs"
      pl={18}
      title={dataset.name}
    >
      <Text size="sm" style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
        {label}
      </Text>
      <Text size="xs" c="dimmed" style={{ flex: '0 0 auto' }}>
        {dataset.dtype} [{dataset.shape.join(', ')}]
      </Text>
    </Group>
  )
}

function FolderNode({
  node,
  depth,
  expandAll,
}: {
  node: ShotDatasetNode<HZDRHDF5Dataset>
  depth: number
  expandAll: boolean
}) {
  // Children render only while the folder is open: a campaign file can hold
  // thousands of datasets.
  const [open, setOpen] = useState(depth === 0 || expandAll)
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        style={{ cursor: 'pointer', overflowWrap: 'anywhere' }}
        title={node.path}
      >
        <Text span size="sm" fw={500}>
          {node.label}
        </Text>{' '}
        <Text span size="xs" c="dimmed">
          {countShotDatasets(node)}
        </Text>
      </summary>
      {open ? (
        <Stack gap={2} pl={12} mt={2}>
          <TreeNodes
            nodes={node.children}
            depth={depth + 1}
            expandAll={expandAll}
          />
        </Stack>
      ) : null}
    </details>
  )
}

function TreeNodes({
  nodes,
  depth,
  expandAll,
}: {
  nodes: ShotDatasetNode<HZDRHDF5Dataset>[]
  depth: number
  expandAll: boolean
}) {
  return (
    <>
      {nodes.map((node) =>
        node.dataset ? (
          <DatasetRow
            key={node.path}
            dataset={node.dataset}
            label={node.label}
          />
        ) : (
          <FolderNode
            key={node.path}
            node={node}
            depth={depth}
            expandAll={expandAll}
          />
        )
      )}
    </>
  )
}

/** Datasets as a folding tree; the top level starts open. */
export function ShotDatasetTree({
  datasets,
  expandAll = false,
}: {
  datasets: HZDRHDF5Dataset[]
  expandAll?: boolean
}) {
  const nodes = useMemo(() => buildShotDatasetTree(datasets), [datasets])
  // Remount when a search starts or ends, so folders open or fold again.
  return (
    <Stack gap={2} key={expandAll ? 'search' : 'browse'}>
      <TreeNodes nodes={nodes} depth={0} expandAll={expandAll} />
    </Stack>
  )
}

/**
 * The shot's own datasets in the campaign file, searchable, with the rest of
 * the file behind a toggle.
 */
export function ShotDatasetBrowser({
  shot,
  datasets,
  container,
}: {
  shot: HZDRShot
  datasets: HZDRHDF5Dataset[]
  container?: string | null
}) {
  const [search, setSearch] = useState('')
  const [showCampaign, setShowCampaign] = useState(false)
  const split = useMemo(
    () => splitShotDatasets(shot, datasets, container),
    [shot, datasets, container]
  )
  const query = search.trim().toLowerCase()
  const filter = (list: HZDRHDF5Dataset[]) =>
    query
      ? list.filter((dataset) => dataset.name.toLowerCase().includes(query))
      : list
  const own = filter(split.shot)
  const rest = filter(split.rest)

  return (
    <Stack gap="xs">
      {datasets.length > 0 ? (
        <TextInput
          size="xs"
          aria-label="Search datasets"
          placeholder="Search datasets"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      ) : null}
      {own.length ? (
        <ShotDatasetTree datasets={own} expandAll={Boolean(query)} />
      ) : (
        <Text size="sm" c="dimmed">
          {query
            ? 'No dataset of this shot matches.'
            : 'No dataset in the campaign file belongs to this shot.'}
        </Text>
      )}
      {split.rest.length > 0 ? (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => setShowCampaign((value) => !value)}
          style={{ alignSelf: 'flex-start' }}
          aria-expanded={showCampaign}
        >
          {showCampaign
            ? 'Hide the campaign file'
            : `Show the campaign file (${split.rest.length} datasets)`}
        </Button>
      ) : null}
      {showCampaign ? (
        rest.length ? (
          <ShotDatasetTree datasets={rest} expandAll={Boolean(query)} />
        ) : (
          <Text size="sm" c="dimmed">
            No other dataset matches.
          </Text>
        )
      ) : null}
    </Stack>
  )
}
