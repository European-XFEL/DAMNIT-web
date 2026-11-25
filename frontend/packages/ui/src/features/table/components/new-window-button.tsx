import type { MouseEventHandler } from 'react'
import { Link } from 'react-router'
import { ActionIcon, Tooltip, getDefaultZIndex, rem } from '@mantine/core'
import { IconExternalLink } from '@tabler/icons-react'

import { openPopup } from '#src/utils/popup'

const LABEL = 'Open in new window'

type NewWindowButtonProps = {
  to: string
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  onAuxClick?: MouseEventHandler<HTMLAnchorElement>
}

function NewWindowButton({
  to,
  className,
  onClick,
  onAuxClick,
}: NewWindowButtonProps) {
  return (
    // Over the context menu, which sits at the top z-index.
    <Tooltip label={LABEL} zIndex={getDefaultZIndex('max')}>
      <ActionIcon
        component={Link}
        to={to}
        target="_blank"
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={LABEL}
        className={className}
        onClick={(event) => {
          openPopup(event)
          onClick?.(event)
        }}
        onAuxClick={onAuxClick}
      >
        <IconExternalLink
          style={{ width: rem(16), height: rem(16) }}
          stroke={1.5}
        />
      </ActionIcon>
    </Tooltip>
  )
}

export default NewWindowButton
