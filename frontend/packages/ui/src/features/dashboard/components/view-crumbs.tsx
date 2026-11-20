import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Breadcrumbs,
  Text,
  UnstyledButton,
  VisuallyHidden,
  rem,
} from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'

import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import { useViewCrumbs } from '#src/features/dashboard/hooks/use-view-crumbs'

import classes from './view-crumbs.module.css'

type ViewCrumbsProps = {
  identity: ReactNode
}

function ViewCrumbs({ identity }: ViewCrumbsProps) {
  const crumbs = useViewCrumbs()

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
