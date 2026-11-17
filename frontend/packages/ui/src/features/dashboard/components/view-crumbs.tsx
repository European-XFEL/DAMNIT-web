import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Breadcrumbs,
  Text,
  UnstyledButton,
  VisuallyHidden,
  rem,
} from '@mantine/core'
import { IconChevronRight, IconFileCode, IconTable } from '@tabler/icons-react'

import PlotKindIcon from '#src/components/icons/plot-kind-icon'
import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import { useOpenView } from '#src/features/dashboard/hooks/use-open-view'
import { usePlotEntries } from '#src/features/dashboard/hooks/use-plot-entries'
import { usePageTitle } from '#src/features/dashboard/hooks/use-page-title'

import classes from './view-crumbs.module.css'

type ViewCrumbsProps = {
  identity: ReactNode
  // The proposal as the page title names it, such as "p6996"
  heading: string
}

type Crumb = {
  label: string
  icon?: ReactNode
  // Read after the label, since the icon itself is hidden from screen readers.
  iconLabel?: string
  detail?: string
}

function useViewCrumbs(): Crumb[] {
  const view = useOpenView()
  const plots = usePlotEntries()

  switch (view?.kind) {
    case 'table':
      return [
        { label: 'Table' },
        { label: 'All runs', icon: <IconTable stroke={1.5} /> },
      ]
    case 'context-file':
      return [{ label: 'Context file', icon: <IconFileCode stroke={1.5} /> }]
    case 'plot': {
      const plot = plots.find((entry) => entry.id === view.id)
      if (!plot) {
        return [{ label: 'Plots' }]
      }

      return [
        { label: 'Plots' },
        {
          label: plot.name,
          icon: <PlotKindIcon kind={plot.kind} />,
          iconLabel: `${plot.kind} plot`,
          detail: plot.subtitle,
        },
      ]
    }
    case undefined:
      return []
  }
}

function pageTitle(heading: string, crumb: Crumb | undefined) {
  if (crumb === undefined) {
    return heading
  }

  const detail = crumb.detail ? ` (${crumb.detail})` : ''

  return `${heading}: ${crumb.label}${detail}`
}

function ViewCrumbs({ identity, heading }: ViewCrumbsProps) {
  const crumbs = useViewCrumbs()
  usePageTitle(pageTitle(heading, crumbs.at(-1)))

  // Below `sm` the row has no width for the group a view sits in. Not
  // `hiddenFrom`: Mantine leaves the separator of a hidden crumb behind.
  const shown = useIsMobile() ? crumbs.slice(-1) : crumbs

  return (
    <nav aria-label="Breadcrumb" className={classes.nav}>
      <Breadcrumbs
        separator={
          <IconChevronRight
            style={{ width: rem(12), height: rem(12) }}
            stroke={2}
          />
        }
        separatorMargin={8}
        classNames={{
          root: classes.crumbs,
          separator: classes.separator,
          breadcrumb: classes.crumb,
        }}
      >
        <UnstyledButton
          component={Link}
          to="table"
          className={classes.identity}
        >
          {identity}
        </UnstyledButton>
        {shown.map((crumb, index) => {
          const isLast = index === shown.length - 1

          return (
            <Text
              key={index}
              span
              size="sm"
              // The group crumbs before the page you are on are labels for
              // where it sits, so they take the secondary gray.
              c={isLast ? undefined : 'gray.7'}
              aria-current={isLast ? 'page' : undefined}
            >
              {crumb.icon && (
                <span className={classes.icon} aria-hidden>
                  {crumb.icon}
                </span>
              )}
              {crumb.label}
              {crumb.iconLabel && (
                <VisuallyHidden>, {crumb.iconLabel}</VisuallyHidden>
              )}
              {crumb.detail && (
                <Text span inherit c="gray.7">
                  {` (${crumb.detail})`}
                </Text>
              )}
            </Text>
          )
        })}
      </Breadcrumbs>
    </nav>
  )
}

export default ViewCrumbs
