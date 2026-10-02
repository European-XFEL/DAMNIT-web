import { useId } from 'react'
import { Image, ScrollArea, Skeleton, Text, rem } from '@mantine/core'

import CellErrorCard from '#src/components/feedback/cell-error-card'
import SectionHeading, {
  mutedC,
} from '#src/components/headings/section-heading'
import { DTYPES } from '#src/constants'
import type { RunId } from '#src/data/table/table-data.types'
import { FONT_SIZE_DATA } from '#src/styles/fonts'
import { formatDate } from '#src/utils/helpers'
import {
  blockKey,
  type VariableBlock,
  type VariableGroupBlock,
} from '#src/utils/variable-blocks'

import classes from './run-details.module.css'
import type { RunEntry } from './run-entries'
import { useRunEntries } from './use-run-entries'

// One line box for the title and either kind of value, so every row keeps the
// same rhythm whatever it holds.
const LINE_HEIGHT = rem(22)

type EntryValueProps = {
  entry: RunEntry
}

function EntryValue({ entry }: EntryValueProps) {
  if (entry.state === 'error') {
    return <CellErrorCard error={entry.error} variant="panel" />
  }
  if (entry.state === 'blank') {
    return <DataText muted>No value</DataText>
  }
  // The panel draws no curve, so an array reads No preview however far its
  // value has got.
  if (entry.dtype === DTYPES.array1d) {
    return <DataText muted>No preview</DataText>
  }
  if (entry.state === 'loading') {
    return <Skeleton mt={4} h={12} w={120} radius="sm" />
  }

  const { value, dtype } = entry
  switch (dtype) {
    case DTYPES.image:
      return (
        <Image
          className={classes.image}
          src={String(value)}
          alt={entry.title}
        />
      )
    case DTYPES.number:
      return <MonoValue>{String(value)}</MonoValue>
    case DTYPES.timestamp:
      return <MonoValue>{formatDate(Number(value))}</MonoValue>
    // Any other dtype prints the way the grid's text fallback prints it.
    default:
      return <DataText>{String(value)}</DataText>
  }
}

type DataTextProps = {
  children: string
  muted?: boolean
}

// Italic when muted, as in the nav's placeholder: the app speaking, not the run.
function DataText({ children, muted = false }: DataTextProps) {
  return (
    <Text
      fz={FONT_SIZE_DATA}
      lh={LINE_HEIGHT}
      fs={muted ? 'italic' : undefined}
      c={muted ? mutedC : undefined}
    >
      {children}
    </Text>
  )
}

type MonoValueProps = {
  children: string
}

// A Source Code Pro glyph is a fifth wider than the sans, so mono sits one
// step under the data size, as in the grid.
function MonoValue({ children }: MonoValueProps) {
  return (
    <Text fz="xs" lh={LINE_HEIGHT} ff="monospace">
      {children}
    </Text>
  )
}

// An image, or the skeleton standing in for one, needs the panel's width.
function isStacked(entry: RunEntry) {
  return (
    (entry.state === 'value' || entry.state === 'loading') &&
    entry.dtype === DTYPES.image
  )
}

type EntryRowProps = {
  entry: RunEntry
}

function EntryRow({ entry }: EntryRowProps) {
  return (
    <div className={isStacked(entry) ? classes.stackedRow : classes.row}>
      <Text
        component="dt"
        size="xs"
        fw={500}
        lh={LINE_HEIGHT}
        c={mutedC}
        className={classes.title}
      >
        {entry.columnTitle}
      </Text>
      <dd className={classes.value}>
        <EntryValue entry={entry} />
      </dd>
    </div>
  )
}

type GroupBlockProps = {
  block: VariableGroupBlock<RunEntry>
}

// Members go by their short title, since the heading above says the rest.
function GroupBlock({ block }: GroupBlockProps) {
  const headingId = useId()

  return (
    <div role="group" aria-labelledby={headingId} className={classes.group}>
      <SectionHeading id={headingId}>{block.title}</SectionHeading>
      <dl className={classes.members}>
        {block.members.map((entry) => (
          <EntryRow key={entry.name} entry={entry} />
        ))}
      </dl>
    </div>
  )
}

type Section =
  | { kind: 'group'; block: VariableGroupBlock<RunEntry> }
  | { kind: 'entries'; key: string; entries: RunEntry[] }

// A heading may not sit inside a <dl>, so ungrouped entries between groups
// share a list, keyed by the group above to stay mounted as its rows change.
function toSections(blocks: VariableBlock<RunEntry>[]): Section[] {
  const sections: Section[] = []
  for (const block of blocks) {
    if (block.kind === 'group') {
      sections.push({ kind: 'group', block })
      continue
    }

    const last = sections.at(-1)
    if (last?.kind === 'entries') {
      last.entries.push(block)
    } else {
      const key = last ? `entries:after:${blockKey(last.block)}` : 'entries'
      sections.push({ kind: 'entries', key, entries: [block] })
    }
  }
  return sections
}

type RunDetailsProps = {
  run: RunId
  variable: string | null
}

function RunDetails({ run, variable }: RunDetailsProps) {
  const blocks = useRunEntries(run, variable)
  if (blocks == null) {
    return null
  }

  if (blocks.length === 0) {
    return <DataText muted>No values to show</DataText>
  }

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <div className={classes.list}>
        {toSections(blocks).map((section) =>
          section.kind === 'group' ? (
            <GroupBlock key={blockKey(section.block)} block={section.block} />
          ) : (
            <dl key={section.key}>
              {section.entries.map((entry) => (
                <EntryRow key={entry.name} entry={entry} />
              ))}
            </dl>
          )
        )}
      </div>
    </ScrollArea>
  )
}

export default RunDetails
