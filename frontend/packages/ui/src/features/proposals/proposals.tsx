import { type ComponentType, memo, useState } from 'react'
import { Link } from 'react-router'
import {
  Box,
  Code,
  Group,
  rem,
  Stack,
  Text,
  type ElementProps,
  type TextProps,
} from '@mantine/core'
import {
  IconCalendarEvent,
  IconChevronRight,
  IconPlus,
} from '@tabler/icons-react'
import cx from 'clsx'
import dayjs from 'dayjs'
import { DataTable } from 'mantine-datatable'

import { selectAvailableProposals } from '../../auth/auth.slice'
import {
  InstrumentBadge,
  type InstrumentBadgeProps,
} from '../../components/badges'
import { useProposals } from '../../data/metadata'
import { useAppSelector } from '../../redux/hooks'
import { orderBy } from '../../utils/objects'
import styles from './proposals.module.css'

const formatRunCycle = (date: string) => {
  const year = date.slice(0, 4)
  const month = date.slice(4, 6)
  const period = month === '01' ? 'I' : 'II'
  return `${year} - ${period}`
}

type CellProps = {
  isExpanded: boolean
}

/*
 * -----------------------------
 *   ExpandedCell Component
 * -----------------------------
 */

interface ExpandedCellProps extends CellProps {
  Component: ComponentType<{ className?: string }>
}

const ExpandedCell = memo(function ExpandedCell({
  Component,
  isExpanded,
}: ExpandedCellProps) {
  return (
    <Component
      className={cx(styles.icon, styles.expandIcon, {
        [styles.expandIconRotated]: isExpanded,
      })}
    />
  )
})

/*
 * -----------------------------
 *   CycleCell Component
 * -----------------------------
 */

interface CycleCellProps extends CellProps {
  cycle: string
}

const CycleCell = memo(function CycleCell({
  cycle,
  isExpanded,
}: CycleCellProps) {
  return (
    <Group gap={0}>
      <ExpandedCell Component={IconChevronRight} isExpanded={isExpanded} />
      <Group component="span" ml={10} gap={6}>
        <IconCalendarEvent className={cx(styles.icon)} />
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

interface TextCellProps extends TextProps, ElementProps<'p', keyof TextProps> {
  text: string
  link?: string
}

const TextCell = memo(function TextCell({
  text,
  link,
  ...props
}: TextCellProps) {
  const component = <Text {...props}>{text}</Text>

  return <Group>{link ? <Link to={link}>{component}</Link> : component}</Group>
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
  title: string
  damnit_path: string
}

const ProposalContent = memo(function ProposalContent({
  title,
  damnit_path,
}: ProposalContentProps) {
  return (
    <Stack className={styles.content} p="xs" gap={6} pl={65} pr={65}>
      <Group gap={6}>
        <Text size="xs" className={styles.contentLabel} c="dark.4">
          Title:
        </Text>
        <Text size="xs">{title}</Text>
      </Group>
      <Group gap={6}>
        <Text size="xs" className={styles.contentLabel} c="dark.4">
          Path:
        </Text>
        <Code style={{ fontSize: rem(11) }}>{damnit_path}</Code>
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
  proposals: string[]
}

const ProposalSubTable = memo(function ProposalSubTable({
  proposals,
}: ProposalSubTableProps) {
  const [expandedProposals, setExpandedProposals] = useState<string[]>([])
  const { proposals: proposalInfo, isLoading } = useProposals(proposals)

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
              <ExpandedCell
                Component={IconPlus}
                isExpanded={expandedProposals.includes(String(number))}
              />
            </Box>
          ),
        },
        {
          accessor: 'instrument',
          noWrap: true,
          width: 50,
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
        isLoading
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
        content: ({ record }) => (
          <ProposalContent
            title={record.title}
            damnit_path={record.damnit_path}
          />
        ),
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

const Proposals = () => {
  const proposals = useAppSelector(selectAvailableProposals)

  const cycles = Object.keys(proposals).sort((a, b) => Number(b) - Number(a))
  const [expandedCycles, setExpandedCycles] = useState<string[]>(
    cycles.slice(0, 1) // Expand the most recent cycle by default
  )

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
          render: ({ cycle }) => (
            <CycleCell
              cycle={cycle}
              isExpanded={expandedCycles.includes(cycle)}
            />
          ),
        },
      ]}
      records={cycles.map((cycle) => ({
        cycle,
        proposals: proposals[cycle],
      }))}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedCycles,
          onRecordIdsChange: setExpandedCycles,
        },
        content: ({ record }) => {
          return <ProposalSubTable proposals={record.proposals} />
        },
      }}
    />
  )
}

export default Proposals
