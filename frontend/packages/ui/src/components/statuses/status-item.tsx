import type { ReactNode } from 'react'
import { Box, Tooltip } from '@mantine/core'

import classes from './status-item.module.css'

// Keyboard and touch users open the tooltip too, since it carries the words.
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: true }

type StatusItemProps = {
  tooltip: ReactNode
  icon?: ReactNode
  label?: ReactNode
  value?: ReactNode
  // Names an item that shows only an icon.
  'aria-label'?: string
  onClick?: () => void
  warning?: boolean
}

function StatusItem({
  tooltip,
  icon,
  label,
  value,
  'aria-label': ariaLabel,
  onClick,
  warning = false,
}: StatusItemProps) {
  // One element whether or not there is an action, so a state change that
  // adds or removes it keeps keyboard focus where it was.
  return (
    <Tooltip label={tooltip} events={TOOLTIP_EVENTS} multiline maw={320}>
      <Box
        component="span"
        className={`${classes.item} mantine-focus-auto`}
        mod={{ action: onClick != null, warning }}
        tabIndex={0}
        role={onClick ? 'button' : ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={(event) => {
          if (onClick && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            if (!event.repeat) {
              onClick()
            }
          }
        }}
      >
        {icon}
        {label != null && (
          <span>
            {label}
            {value != null && (
              <>
                : <b>{value}</b>
              </>
            )}
          </span>
        )}
      </Box>
    </Tooltip>
  )
}

export default StatusItem
