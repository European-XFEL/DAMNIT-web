import { memo, useState } from 'react'
import { Link } from 'react-router'
import {
  Anchor,
  Box,
  Code,
  Group,
  rem,
  Stack,
  Text,
  type TextProps,
} from '@mantine/core'
import { IconCalendarEvent, IconChevronRight } from '@tabler/icons-react'
import cx from 'clsx'
import dayjs from 'dayjs'
import { DataTable } from 'mantine-datatable'

import InstrumentBadge, {
  type InstrumentBadgeProps,
} from '#src/components/badges/instrument-badge'
import CenteredLoader from '#src/components/feedback/centered-loader'
import useProposals from '#src/data/metadata/use-proposals'
import { type AvailableProposals } from '#src/types'
import { isEmpty } from '#src/utils/helpers'
import { orderBy } from '#src/utils/objects'

import styles from './proposals.module.css'

const formatRunCycle = (date: string) => {
  const year = date.slice(0, 4)
  const month = date.slice(4, 6)
  const period = month === '01' ? 'I' : 'II'
  return `${year} - ${period}`
}

/*
 * -----------------------------
 *   ExpandedCell Component
 * -----------------------------
 */

type ExpandedCellProps = {
  isExpanded: boolean
}

// Both levels expand with the same mark, so a row's state reads the same
// wherever it sits.
const ExpandedCell = memo(function ExpandedCell({
  isExpanded,
}: ExpandedCellProps) {
  return (
    <IconChevronRight
      className={cx(styles.icon, styles.expandIcon, {
        [styles.expandIconRotated]: isExpanded,
      })}
      stroke={1.5}
      aria-hidden
    />
  )
})

/*
 * -----------------------------
 *   CycleCell Component
 * -----------------------------
 */

type CycleCellProps = {
  cycle: string
}

// A semester row is always expanded.
const CycleCell = memo(function CycleCell({ cycle }: CycleCellProps) {
  return (
    <Group gap={0}>
      <ExpandedCell isExpanded />
      <Group component="span" ml={10} gap={6}>
        <IconCalendarEvent className={styles.icon} stroke={1.5} />
        <span>{formatRunCycle(cycle)}</span>
      </Group>
    </Group>
  )
})

/*
 * -----------------------------
 *   InstrumentCell Component
 * -----------------------------
 */

type InstrumentCellProps = InstrumentBadgeProps

const InstrumentCell = memo(function InstrumentCell(
  props: InstrumentCellProps
) {
  return <InstrumentBadge {...props} />
})

/*
 * -----------------------------
 *   TextCell Component
 * -----------------------------
 */

interface TextCellProps extends TextProps {
  text: string
  link?: string
}

const TextCell = memo(function TextCell({
  text,
  link,
  ...props
}: TextCellProps) {
  return (
    <Group>
      {link ? (
        <Anchor component={Link} to={link} {...props}>
          {text}
        </Anchor>
      ) : (
        <Text {...props}>{text}</Text>
      )}
    </Group>
  )
})

/*
 * -----------------------------
 *   DateCell Component
 * -----------------------------
 */

interface DateCellProps extends Omit<TextCellProps, 'text'> {
  datetime: string
}

const DateCell = memo(function DateCell({ datetime, ...props }: DateCellProps) {
  const date = dayjs(datetime)
  return (
    <TextCell
      {...props}
      text={date.format('MMMM DD, YYYY')}
      c="gray.7"
      className={styles.proposalDate}
    />
  )
})

/*
 * ---------------------------------
 *   ProposalContentProps Component
 * ---------------------------------
 */

type ProposalContentProps = {
  proposal: number
}

const ProposalContent = memo(function ProposalContent({
  proposal,
}: ProposalContentProps) {
  const { proposals, isLoading } = useProposals({
    proposals: [proposal],
    full: true,
  })

  if (isLoading) {
    return (
      <Stack h={50}>
        <CenteredLoader size="xs" />
      </Stack>
    )
  }

  if (isEmpty(proposals)) {
    return <div />
  }

  const proposalInfo = proposals[0]

  return (
    <Stack className={styles.content} p="xs" gap={6} pl={65} pr={65}>
      <Group gap={6}>
        <Text size="xs" className={styles.contentLabel} c="gray.7">
          Title:
        </Text>
        <Text size="xs">{proposalInfo.title}</Text>
      </Group>
      <Group gap={6}>
        <Text size="xs" className={styles.contentLabel} c="gray.7">
          Path:
        </Text>
        <Code fz="xxs">{proposalInfo.damnit_path}</Code>
      </Group>
    </Stack>
  )
})

/*
 * ---------------------------------
 *   ProposalSubTable Component
 * ---------------------------------
 */

type ProposalSubTableProps = {
  proposals: number[]
}

const ProposalSubTable = memo(function ProposalSubTable({
  proposals,
}: ProposalSubTableProps) {
  // The datatable keys its rows by `number`, so the ids it hands back are
  // numbers too.
  const [expandedProposals, setExpandedProposals] = useState<number[]>([])
  const { proposals: proposalInfo, isLoading } = useProposals({ proposals })

  return (
    <DataTable
      noHeader
      striped
      idAccessor="number"
      minHeight={isLoading ? 100 : 0}
      columns={[
        {
          accessor: 'id',
          noWrap: true,
          render: ({ number }) => (
            <Box component="span" ml={23} mr={5}>
              <ExpandedCell isExpanded={expandedProposals.includes(number)} />
            </Box>
          ),
        },
        {
          accessor: 'instrument',
          noWrap: true,
          // HED, the widest tag, needs 52 px at the 12 px badge floor.
          width: rem(56),
          render: ({ instrument }) => (
            <InstrumentCell instrument={instrument} size="sm" />
          ),
          cellsStyle: () => (_) => ({ paddingLeft: 0 }),
        },
        {
          accessor: 'proposal',
          noWrap: true,
          textAlign: 'right',
          render: ({ number }) => (
            <TextCell
              text={String(number)}
              link={`/proposal/${number}`}
              size="sm"
            />
          ),
        },
        {
          accessor: 'principal_investigator',
          noWrap: true,
          width: '100%',
          render: ({ principal_investigator, number }) => (
            <TextCell
              text={principal_investigator}
              link={`/proposal/${number}`}
              size="sm"
            />
          ),
        },
        {
          accessor: 'start_date',
          noWrap: true,
          render: ({ start_date }) => (
            <DateCell datetime={start_date} size="xs" />
          ),
        },
      ]}
      records={
        isLoading || proposalInfo == null
          ? []
          : proposalInfo
              .concat()
              .sort(orderBy(['start_date', 'instrument'], ['desc', 'asc']))
      }
      fetching={isLoading}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedProposals,
          onRecordIdsChange: setExpandedProposals,
        },
        content: ({ record }) => <ProposalContent proposal={record.number} />,
      }}
    />
  )
})

const ProposalHeader = () => {
  return (
    <Group justify="space-between">
      <span>Proposal</span>
      <span className={styles.proposalDate}>Beamtime date</span>
    </Group>
  )
}

type ProposalsProps = {
  proposals: AvailableProposals
}

const Proposals = ({ proposals }: ProposalsProps) => {
  const cycles = Object.keys(proposals).sort((a, b) => Number(b) - Number(a))

  return (
    <DataTable
      withTableBorder
      withColumnBorders
      highlightOnHover
      idAccessor="cycle"
      columns={[
        {
          accessor: 'cycle',
          title: <ProposalHeader />,
          noWrap: true,
          render: ({ cycle }) => <CycleCell cycle={cycle} />,
        },
      ]}
      records={cycles.map((cycle) => ({
        cycle,
        proposals: proposals[cycle],
      }))}
      rowExpansion={{
        trigger: 'always',
        content: ({ record }) => {
          return <ProposalSubTable proposals={record.proposals} />
        },
      }}
    />
  )
}

export default Proposals
