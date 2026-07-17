import { useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { buildPreviewQuery } from './preview-chunks'

type PreviewChunkLoaderProps = {
  proposal: string
  runs: number[]
  variable: string
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
}: PreviewChunkLoaderProps) {
  const query = useMemo(() => buildPreviewQuery(runs), [runs])

  useQuery(query, {
    variables: { proposal, variable },
    fetchPolicy: 'cache-and-network',
    // One field per run, so a run the backend cannot read errors on its own
    // while the rest of the chunk answers normally. The default policy throws
    // the whole response away as soon as any error is present, which would lose
    // the other 49 runs along with it.
    errorPolicy: 'all',
    skip: !proposal || !runs.length,
  })

  return null
}

export default PreviewChunkLoader
