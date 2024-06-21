import { memo, useState } from "react"
import { Link } from "react-router-dom"
import { Badge, Box, Code, Group, Stack } from "@mantine/core"
import {
  IconCalendarEvent,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react"
import clsx from "clsx"
import dayjs from "dayjs"
import { DataTable } from "mantine-datatable"

import { getCycles, getProposal, getProposals } from "../../utils/api/user"
import classes from "./ProposalsList.module.css"

const cycles = getCycles()

const isShallowEqual = (array1, array2) => {
  if (array1.length !== array2.length) {
    return false
  }

  return array1.every((elem, index) => elem === array2[index])
}

const ExpandedCell = memo(({ Component, isExpanded }) => {
  return (
    <Component
      className={clsx(classes.icon, classes.expandIcon, {
        [classes.expandIconRotated]: isExpanded,
      })}
    />
  )
})

const CycleCell = memo(({ cycle, isExpanded }) => {
  return (
    <Group gap={0}>
      <ExpandedCell Component={IconChevronRight} isExpanded={isExpanded} />
      <Group component="span" ml={10} gap={6}>
        <IconCalendarEvent className={clsx(classes.icon)} />
        <span>{cycle}</span>
      </Group>
    </Group>
  )
})

const INSTRUMENT_COLORS = {
  scs: "blue",
}

const InstrumentCell = memo(({ instrument }) => {
  return (
    <Badge color={INSTRUMENT_COLORS["instrument"]} size="md" radius="md">
      {instrument}
    </Badge>
  )
})

const TextCell = memo(({ text, link }) => {
  const component = <span>{text}</span>

  return link ? <Link to={link}>{component}</Link> : component
})

const DateCell = memo(({ datetime }) => {
  const date = dayjs(datetime)
  return <TextCell text={date.format("DD-MM-YYYY")} />
})

const ProposalContent = memo(({ proposal: proposal_number }) => {
  const proposal = getProposal(proposal_number)

  return (
    <Stack className={classes.details} p="xs" gap={6} pl={65} pr={65}>
      <Group gap={9}>
        <div className={classes.label}>Title:</div>
        <div>{proposal.title}</div>
      </Group>
      <Group gap={6}>
        <div className={classes.label}>Path:</div>
        <Code>{proposal.path}</Code>
      </Group>
    </Stack>
  )
})

const ProposalSubTable = memo(({ cycle }) => {
  const [expandedProposals, setExpandedProposals] = useState<number[]>([])

  const handleExpandedProposals = (newProposals) => {
    setExpandedProposals((currentProposals) => {
      return isShallowEqual(currentProposals, newProposals)
        ? currentProposals
        : newProposals
    })
  }

  return (
    <DataTable
      noHeader
      striped
      idAccessor="proposal"
      columns={[
        {
          accessor: "id",
          noWrap: true,
          render: ({ proposal }) => (
            <Box component="span" ml={23} mr={5}>
              <ExpandedCell
                Component={IconPlus}
                isExpanded={expandedProposals.includes(proposal)}
              />
            </Box>
          ),
        },
        {
          accessor: "instrument",
          noWrap: true,
          render: ({ instrument }) => (
            <InstrumentCell instrument={instrument} />
          ),
          cellsStyle: () => (theme) => ({ paddingLeft: 0 }),
        },
        {
          accessor: "proposal",
          noWrap: true,
          textAlign: "right",
          render: ({ proposal }) => (
            <TextCell text={proposal} link={`/proposal/${proposal}`} />
          ),
        },
        {
          accessor: "principal_investigator",
          noWrap: true,
          width: "100%",
          render: ({ principal_investigator, proposal }) => (
            <TextCell
              text={principal_investigator}
              link={`/proposal/${proposal}`}
            />
          ),
        },
        {
          accessor: "start_date",
          noWrap: true,
          render: ({ start_date }) => <DateCell datetime={start_date} />,
        },
      ]}
      records={getProposals(cycle)}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedProposals,
          onRecordIdsChange: handleExpandedProposals,
        },
        content: ({ record }) => <ProposalContent proposal={record.proposal} />,
      }}
    />
  )
})

const ProposalHeader = () => {
  return (
    <Group justify="space-between">
      <span>Proposal</span>
      <span>Beamtime date</span>
    </Group>
  )
}

const ProposalsList = () => {
  const [expandedCycles, setExpandedCycles] = useState<number[]>([])

  const handleExpandedCycles = (newCycles) => {
    setExpandedCycles((currentCycles) => {
      return isShallowEqual(currentCycles, newCycles)
        ? currentCycles
        : newCycles
    })
  }

  return (
    <DataTable
      withTableBorder
      withColumnBorders
      highlightOnHover
      idAccessor="cycle"
      columns={[
        {
          accessor: "cycle",
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
      records={cycles}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedCycles,
          onRecordIdsChange: handleExpandedCycles,
        },
        content: ({ record }) => <ProposalSubTable cycle={record.cycle} />,
      }}
    />
  )
}

export default ProposalsList
