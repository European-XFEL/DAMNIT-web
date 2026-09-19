import { useId } from 'react'
import { Image, ScrollArea, Text, rem } from '@mantine/core'

import SectionHeading from '#src/components/headings/section-heading'
import { DTYPES } from '#src/constants'
import type { RunEntry } from '#src/data/table/run-entries'
import type { RunId } from '#src/data/table/table-data.types'
import { FONT_SIZE_DATA } from '#src/styles/fonts'
import { formatDate } from '#src/utils/helpers'
import {
  blockKey,
  type VariableBlock,
  type VariableGroupBlock,
} from '#src/utils/variable-blocks'

import classes from './run-details.module.css'
import { useRunEntries } from './use-run-entries'

// One line box for the title and either kind of value, so every row keeps the
// same rhythm whatever it holds.
const SCALAR_LINE = rem(22)

type EntryValueProps = {
  entry: RunEntry
}

function EntryValue({ entry }: EntryValueProps) {
  if (entry.state === 'error') {
    return (
      <Text fz={FONT_SIZE_DATA} lh={SCALAR_LINE}>
        {entry.error.message}
      </Text>
    )
  }
  if (entry.state !== 'value') {
    return null
  }

  const { value, dtype } = entry
  switch (dtype) {
    case DTYPES.image:
      return (
        <Image className={classes.image} fit="contain" src={value as string} />
      )
    case DTYPES.number:
    case DTYPES.timestamp:
      return (
        <Text fz="xs" lh={SCALAR_LINE} ff="monospace">
          {dtype === DTYPES.number ? value : formatDate(value as number)}
        </Text>
      )
    case DTYPES.string:
      return (
        <Text fz={FONT_SIZE_DATA} lh={SCALAR_LINE}>
          {value}
        </Text>
      )
    default:
      return (
        <Text fz={FONT_SIZE_DATA} lh={SCALAR_LINE}>
          (no preview)
        </Text>
      )
  }
}

type EntryRowProps = {
  entry: RunEntry
  title: string
}

function EntryRow({ entry, title }: EntryRowProps) {
  const isImage = entry.state === 'value' && entry.dtype === DTYPES.image

  return (
    <div className={isImage ? classes.stackedRow : classes.row}>
      <Text component="dt" size="xs" lh={SCALAR_LINE} className={classes.title}>
        {title}
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
          <EntryRow key={entry.name} entry={entry} title={entry.columnTitle} />
        ))}
      </dl>
    </div>
  )
}

type Section =
  | { kind: 'group'; block: VariableGroupBlock<RunEntry> }
  | { kind: 'entries'; entries: RunEntry[] }

// A heading may not sit inside a <dl>, so the ungrouped entries between two
// groups share a list of their own.
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
      sections.push({ kind: 'entries', entries: [block] })
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

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <div className={classes.list}>
        {toSections(blocks).map((section) =>
          section.kind === 'group' ? (
            <GroupBlock key={blockKey(section.block)} block={section.block} />
          ) : (
            <dl key={`entries:${section.entries[0].name}`}>
              {section.entries.map((entry) => (
                <EntryRow key={entry.name} entry={entry} title={entry.title} />
              ))}
            </dl>
          )
        )}
      </div>
    </ScrollArea>
  )
}

export default RunDetails
