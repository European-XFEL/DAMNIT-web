import { type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ActionIcon, Text, UnstyledButton, rem } from '@mantine/core'
import { IconX } from '@tabler/icons-react'

import PlotKindIcon from '#src/components/icons/plot-kind-icon'
import { removePlot } from '#src/features/plots/plots.slice'
import { type PlotSource } from '#src/types'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { useOpenView } from '#src/features/dashboard/hooks/use-open-view'
import { usePlotEntries } from '#src/features/dashboard/hooks/use-plot-entries'
import { selectPreviousView } from '#src/features/dashboard/stores/dashboard.selectors'

import classes from './navbar.module.css'

type PlotEntryProps = {
  id: string
  kind: PlotSource
  name: string
  subtitle: string
  label: string
  active: boolean
  iconSize: number
  onSelect?: () => void
  onClose: (event: MouseEvent<HTMLButtonElement>) => void
}

// A link, not a NavLink: every plot of a kind shares one path, and a NavLink
// matches the path alone.
function PlotEntry({
  id,
  kind,
  name,
  subtitle,
  label,
  active,
  iconSize,
  onSelect,
  onClose,
}: PlotEntryProps) {
  return (
    <li className={classes.entry} data-active={active || undefined}>
      <UnstyledButton
        component={Link}
        to={`plots/${id}`}
        className={classes.entryButton}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
      >
        <span className={classes.icon}>
          <PlotKindIcon kind={kind} size={iconSize} />
        </span>
        <span className={classes.entryText}>
          <Text span inherit lineClamp={2} className={classes.entryTitle}>
            {name}
          </Text>
          <Text span inherit className={classes.entrySubtitle} c="gray.7">
            {subtitle}
          </Text>
        </span>
      </UnstyledButton>
      <ActionIcon
        className={classes.entryClose}
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={`Close ${label}`}
        onClick={onClose}
      >
        <IconX style={{ width: rem(16), height: rem(16) }} stroke={1.5} />
      </ActionIcon>
    </li>
  )
}

type PlotEntriesProps = {
  onSelect?: () => void
  onLastClosed: () => void
  empty?: ReactNode
  iconSize?: number
}

// The open plots, each shown by its name and closed by its mark, in the nav
// and in the rail's Plots popover alike. A caller under a permanent header
// passes `empty` so the section says it is empty rather than leaving a gap.
function PlotEntries({
  onSelect,
  onLastClosed,
  empty,
  iconSize = 18,
}: PlotEntriesProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const openView = useOpenView()
  const previousView = useAppSelector(selectPreviousView)
  const plots = usePlotEntries()
  const shownId = openView?.kind === 'plot' ? openView.id : undefined

  // Closing unmounts the focused mark with its row, so focus goes to the row
  // taking its place, the row above for the last one, or where the nav says.
  function closePlot(id: string, closeMark: HTMLElement) {
    const row = closeMark.closest('li')
    const neighbor = row?.nextElementSibling ?? row?.previousElementSibling
    const nextFocus = neighbor?.querySelector('a')

    if (id === shownId) {
      navigate(previousView?.url ?? 'table', { state: { closedPlot: id } })
    } else {
      dispatch(removePlot(id))
    }

    if (nextFocus) {
      nextFocus.focus()
    } else {
      onLastClosed()
    }
  }

  if (plots.length === 0) {
    return empty ? <div className={classes.placeholder}>{empty}</div> : null
  }

  return (
    <ul className={classes.entries} aria-label="Plots">
      {plots.map(({ id, kind, name, subtitle, label }) => (
        <PlotEntry
          key={id}
          id={id}
          kind={kind}
          name={name}
          subtitle={subtitle}
          label={label}
          active={id === shownId}
          iconSize={iconSize}
          onSelect={onSelect}
          onClose={(event) => closePlot(id, event.currentTarget)}
        />
      ))}
    </ul>
  )
}

export default PlotEntries
