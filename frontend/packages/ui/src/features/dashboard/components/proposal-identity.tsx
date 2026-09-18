import { Group, Text, Tooltip } from '@mantine/core'

import InstrumentBadge from '#src/components/badges/instrument-badge'

import classes from './proposal-identity.module.css'

export type ProposalIdentityProps = {
  instrument: string
  label: string
  detail?: string
  title?: string
}

// Where a screenshot of the dashboard body was taken. The label identifies the
// proposal (`p6996`, `XPCS`); the detail adds context and steps out below `sm`.
function ProposalIdentity({
  instrument,
  label,
  detail,
  title,
}: ProposalIdentityProps) {
  return (
    <Tooltip
      label={title}
      disabled={!title}
      position="bottom-start"
      openDelay={300}
      maw={480}
      multiline
      withArrow
    >
      <Group className={classes.root} gap={8} wrap="nowrap">
        <InstrumentBadge instrument={instrument} />
        {/* The badge labels the whole identity, so it stands twice as far out
            as the middot between the two fields it labels. */}
        <Group gap={4} wrap="nowrap">
          <Text className={classes.text} span size="sm" fw={600}>
            {label}
          </Text>
          {detail && (
            <>
              <Text span size="sm" c="gray.7" visibleFrom="sm">
                ·
              </Text>
              <Text className={classes.text} span size="sm" visibleFrom="sm">
                {detail}
              </Text>
            </>
          )}
        </Group>
      </Group>
    </Tooltip>
  )
}

export default ProposalIdentity
