import { useLayoutEffect } from 'react'

import {
  useViewCrumbs,
  type Crumb,
} from '#src/features/dashboard/hooks/use-view-crumbs'

function pageTitle(heading: string, crumb: Crumb | undefined) {
  if (crumb === undefined) {
    return heading
  }

  const detail = crumb.detail ? ` (${crumb.detail})` : ''

  return `${heading}: ${crumb.label}${detail}`
}

// Names the proposal, then the view on show as its crumb does, and puts back
// the title before when the dashboard goes.
export function usePageTitle(heading: string) {
  const title = pageTitle(heading, useViewCrumbs().at(-1))

  useLayoutEffect(() => {
    const before = document.title
    document.title = title

    return () => {
      document.title = before
    }
  }, [title])
}
