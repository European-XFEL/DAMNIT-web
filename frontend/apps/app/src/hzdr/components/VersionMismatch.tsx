import { useEffect, useState } from 'react'
import { Badge } from '@mantine/core'

import {
  type APIVersion,
  commitsDiffer,
  comparableAPICommit,
  frontendCommit,
  loadAPIVersion,
} from '../utils/version'

/**
 * A small warning in the header when this page was built from another
 * commit than the API runs: the frontend was not rebuilt after a pull, or the
 * API was not restarted. Nothing when they agree or either is unknown.
 */
export function VersionMismatch() {
  const [api, setAPI] = useState<APIVersion | null>(null)
  useEffect(() => {
    let current = true
    void loadAPIVersion().then((answer) => {
      if (current) setAPI(answer)
    })
    return () => {
      current = false
    }
  }, [])

  const built = frontendCommit()
  const apiCommit = comparableAPICommit(api)
  if (!commitsDiffer(built, apiCommit)) return null
  return (
    <Badge
      color="yellow"
      variant="light"
      data-testid="version-mismatch"
      visibleFrom="sm"
      title={`This page was built from ${built}; the API's checkout has ${apiCommit}. Deploy both together (next-on-server.sh).`}
    >
      Out of step with the API
    </Badge>
  )
}
