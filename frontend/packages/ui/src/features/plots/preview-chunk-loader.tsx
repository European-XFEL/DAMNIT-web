import { useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import type { ChunkFailure } from './plots.types'
import { buildPreviewQuery } from './preview-chunks'

type PreviewChunkLoaderProps = {
  proposal: string
  runs: number[]
  variable: string
  onFailed: (runs: number[], failure: ChunkFailure) => void
}

// Fetches one chunk of a preview plot's runs into the Apollo cache and renders
// nothing. A component can own only one watched query and a plot wants a
// changing number of chunks at once, so each chunk gets its own instance. The
// cache is the assembly point: usePreviewPlotData reads back what these write,
// and two plots overlapping on a run share the entry rather than refetching it.
function PreviewChunkLoader({
  proposal,
  runs,
  variable,
  onFailed,
}: PreviewChunkLoaderProps) {
  const query = useMemo(() => buildPreviewQuery(runs), [runs])

  const { error } = useQuery(query, {
    variables: { proposal, variable },
    fetchPolicy: 'cache-and-network',
    // One field per run, so a run the backend cannot read errors on its own
    // while the rest of the chunk answers normally. The default policy throws
    // the whole response away as soon as any error is present, which would lose
    // the other 49 runs along with it.
    errorPolicy: 'all',
    skip: !proposal || !runs.length,
  })

  // A field error writes its run as null, and that is a failure too: a run
  // with nothing to plot comes back as a value of dtype none.
  const failure: ChunkFailure | null =
    error == null ? null : error.networkError ? 'network' : 'field'
  useEffect(() => {
    if (failure) {
      onFailed(runs, failure)
    }
  }, [failure, onFailed, runs])

  return null
}

export default PreviewChunkLoader
