import { useRef } from 'react'
import {
  Badge,
  CloseButton,
  Group,
  rem,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { IconCheck, IconSearch } from '@tabler/icons-react'

import { getInstrumentColor } from '#src/components/badges/instruments'

import { listInstruments, toggleInstrument, type ProposalQuery } from './search'
import classes from './proposal-search.module.css'

type ProposalSearchProps = {
  value: string
  onChange: (value: string) => void
  query: ProposalQuery
  // Instruments to show buttons for
  instruments: string[]
  matches: number
  total: number
}

function describeSearch({ instruments, terms }: ProposalQuery) {
  const what =
    instruments.length > 0
      ? `Showing only ${listInstruments(instruments)} proposals`
      : 'Showing proposals'
  return terms.length > 0 ? `${what} matching "${terms.join(' ')}"` : what
}

export default function ProposalSearch({
  value,
  onChange,
  query,
  instruments,
  matches,
  total,
}: ProposalSearchProps) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <Stack gap={8}>
      <TextInput
        ref={ref}
        autoFocus
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Search by proposal number, PI, or title. Start with an instrument, like 'mid', to filter by it"
        aria-label="Search proposals"
        description="Search is case-insensitive."
        inputWrapperOrder={['input', 'description']}
        leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
        rightSection={
          value === '' ? undefined : (
            <CloseButton
              size="sm"
              aria-label="Clear search"
              onClick={() => {
                onChange('')
                ref.current?.focus()
              }}
            />
          )
        }
      />

      {instruments.length > 0 && (
        <Group gap={6} role="group" aria-label="Filter by instrument">
          {instruments.map((instrument) => {
            const active = query.instruments.includes(instrument)
            return (
              <Badge
                key={instrument}
                component="button"
                type="button"
                size="lg"
                radius="xl"
                className={classes.instrumentButton}
                // Selected: filled with the instrument colour and a check.
                // Unselected: plain, with a dot in the instrument colour.
                variant={active ? 'filled' : 'default'}
                color={active ? getInstrumentColor(instrument) : undefined}
                autoContrast
                leftSection={
                  active ? (
                    <IconCheck
                      style={{ width: rem(12), height: rem(12) }}
                      stroke={3}
                    />
                  ) : (
                    <span
                      className={classes.instrumentDot}
                      style={{ background: getInstrumentColor(instrument) }}
                    />
                  )
                }
                aria-pressed={active}
                onClick={() => {
                  onChange(toggleInstrument(query, instrument))
                  ref.current?.focus()
                }}
              >
                {instrument}
              </Badge>
            )
          })}
        </Group>
      )}

      {/* role="status" makes screen readers announce changes */}
      <Text size="sm" c="gray.7" role="status">
        {value.trim() === ''
          ? ''
          : `${describeSearch(query)} · ${matches} of ${total}`}
      </Text>
    </Stack>
  )
}
