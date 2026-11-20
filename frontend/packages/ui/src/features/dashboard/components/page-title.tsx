import { usePageTitle } from '#src/features/dashboard/hooks/use-page-title'
import {
  useViewCrumbs,
  type Crumb,
} from '#src/features/dashboard/hooks/use-view-crumbs'

type PageTitleProps = {
  heading: string
}

function pageTitle(heading: string, crumb: Crumb | undefined) {
  if (crumb === undefined) {
    return heading
  }

  const detail = crumb.detail ? ` (${crumb.detail})` : ''

  return `${heading}: ${crumb.label}${detail}`
}

// A component of its own, not a hook in the shell, so a plot added or removed
// re-renders only this and not the whole shell.
function PageTitle({ heading }: PageTitleProps) {
  usePageTitle(pageTitle(heading, useViewCrumbs().at(-1)))

  return null
}

export default PageTitle
