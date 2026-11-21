import { useState } from 'react'
import { Anchor, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import type { HZDRDataProduct, HZDRShot } from '../types'
import { formatPreviewNumber, useDatasetPreview } from '../utils/columnPreview'
import {
  previewableProductDataset,
  shotAddColumnPath,
} from '../utils/shot-products'

import { MiniCellSparkline, MiniImagePreview } from './previews'

function InlinePreview({
  sourceKey,
  shot,
  datasetName,
}: {
  sourceKey: string
  shot: HZDRShot
  datasetName: string
}) {
  const { preview, loading, error } = useDatasetPreview(
    sourceKey,
    shot,
    datasetName
  )
  if (loading) {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          Reading the dataset…
        </Text>
      </Group>
    )
  }
  if (error || !preview) {
    return (
      <Text size="xs" c="red">
        Could not read this dataset.
      </Text>
    )
  }
  const values = preview.preview
  if (
    preview.preview_kind === 'image' &&
    Array.isArray(values) &&
    Array.isArray(values[0])
  ) {
    return <MiniImagePreview values={values as number[][]} size={160} />
  }
  if (preview.preview_kind === 'line' && Array.isArray(values)) {
    // NaN and infinities arrive as null.
    const numbers = (values as unknown[]).filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value)
    )
    if (numbers.length > 1) return <MiniCellSparkline values={numbers} />
  }
  const scalar = Array.isArray(values) ? values[0] : values
  return (
    <Text size="sm">
      {typeof scalar === 'number' && Number.isFinite(scalar)
        ? formatPreviewNumber(scalar)
        : typeof preview.summary === 'number'
          ? formatPreviewNumber(preview.summary)
          : 'No value'}
    </Text>
  )
}

/**
 * A data product's preview, read only once the row is opened, and a link that
 * adds it as a table column in Context Builder.
 */
export function ShotProductPreview({
  sourceKey,
  shot,
  product,
}: {
  sourceKey: string
  shot: HZDRShot
  product: HZDRDataProduct
}) {
  const [open, setOpen] = useState(false)
  const datasetName = previewableProductDataset(product, shot.hdf5_path)
  if (!datasetName) return null
  const addColumnPath = shotAddColumnPath(sourceKey, datasetName, shot.shot_key)
  return (
    <Stack gap={4}>
      <Group gap="sm">
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Hide preview' : 'Preview'}
        </Button>
        {addColumnPath ? (
          <Anchor component={Link} to={addColumnPath} size="xs">
            Add as column
          </Anchor>
        ) : null}
      </Group>
      {open ? (
        <InlinePreview
          sourceKey={sourceKey}
          shot={shot}
          datasetName={datasetName}
        />
      ) : null}
    </Stack>
  )
}
