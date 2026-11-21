import { memo, useCallback, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconCheck, IconEyeOff, IconPencil } from '@tabler/icons-react'

import type { ColumnSuggestion, HZDRShot } from '../types'
import { useDatasetPreview } from '../utils/columnPreview'
import { suggestionSummary } from '../utils/contextAssist'

import { ColumnPreview } from './ColumnPreview'

/** Rows shown before "Show more": a short list reads, a long one is skipped. */
export const FIRST_SUGGESTIONS = 6

const ORIGIN_COLORS: Record<ColumnSuggestion['origin'], string> = {
  labfrog: 'green',
  metadata: 'blue',
  hdf5: 'violet',
}

/** The column a suggestion would add, on the example shot and the campaign. */
function SuggestionPreview({
  suggestion,
  sourceKey,
  exampleShot,
  shots,
}: {
  suggestion: ColumnSuggestion
  sourceKey?: string
  exampleShot?: HZDRShot
  shots: HZDRShot[]
}) {
  const hdf5 = suggestion.origin === 'hdf5'
  const dataset = useDatasetPreview(
    sourceKey,
    exampleShot,
    hdf5 ? (suggestion.previewName ?? suggestion.field) : undefined
  )
  return (
    <ColumnPreview
      title={suggestion.title}
      exampleShot={exampleShot}
      shots={shots}
      input={
        hdf5
          ? { source: 'hdf5', display: suggestion.display, ...dataset }
          : {
              source: 'metadata',
              field: suggestion.field,
              type: suggestion.type === 'text' ? 'text' : 'number',
              unit: suggestion.unit,
            }
      }
    />
  )
}

/**
 * One suggestion in full: why, what the column does, its preview, and the
 * single-column actions. Shown in the right column on wide screens and under
 * its row on narrow ones.
 */
export function SuggestionDetail({
  suggestion,
  busy,
  sourceKey,
  exampleShot,
  shots,
  onAdd,
  onIgnore,
  onCustomise,
}: {
  suggestion: ColumnSuggestion
  busy: boolean
  sourceKey?: string
  exampleShot?: HZDRShot
  shots: HZDRShot[]
  onAdd: (suggestion: ColumnSuggestion) => void
  onIgnore: (suggestion: ColumnSuggestion) => void
  onCustomise: (suggestion: ColumnSuggestion) => void
}) {
  const [showCode, setShowCode] = useState(false)
  return (
    <Paper
      withBorder
      radius={4}
      p="sm"
      component="section"
      aria-label={`Preview of ${suggestion.title}`}
    >
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text fw={700} size="sm">
            {suggestion.title}
          </Text>
          <Badge
            size="sm"
            radius={4}
            variant="light"
            color={ORIGIN_COLORS[suggestion.origin]}
            style={{ flexShrink: 0 }}
          >
            {suggestion.originLabel}
          </Badge>
        </Group>
        <Text size="xs">
          <Text span fw={600} size="xs">
            Why:{' '}
          </Text>
          {suggestion.reason}
        </Text>
        {suggestion.examples.length ? (
          <Text size="xs" c="dimmed">
            For example: {suggestion.examples.join(', ')}
          </Text>
        ) : null}
        <Group gap={6} align="flex-start" wrap="nowrap">
          <Text fw={600} size="xs" style={{ flexShrink: 0 }}>
            What it does:
          </Text>
          <Text size="xs">{suggestion.displayHelp}</Text>
        </Group>
        <SuggestionPreview
          suggestion={suggestion}
          sourceKey={sourceKey}
          exampleShot={exampleShot}
          shots={shots}
        />
        {showCode ? <Code block>{suggestion.block.trim()}</Code> : null}
        <Group gap="xs" mt={2}>
          <Button
            size="xs"
            leftSection={<IconCheck size={14} />}
            onClick={() => onAdd(suggestion)}
            disabled={busy}
          >
            Add this column
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconEyeOff size={14} />}
            onClick={() => onIgnore(suggestion)}
          >
            Ignore this suggestion
          </Button>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPencil size={14} />}
            onClick={() => onCustomise(suggestion)}
          >
            Customise
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={() => setShowCode((shown) => !shown)}
            aria-expanded={showCode}
          >
            {showCode ? 'Hide code' : 'Show code'}
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}

const SuggestionRow = memo(function SuggestionRow({
  suggestion,
  summary,
  checked,
  selected,
  detail,
  onToggle,
  onSelect,
}: {
  suggestion: ColumnSuggestion
  summary: string
  checked: boolean
  selected: boolean
  detail?: ReactNode
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <Paper
      withBorder
      radius={4}
      px="sm"
      py={6}
      component="article"
      aria-label={`Suggestion: ${suggestion.title}`}
      bg={selected ? 'var(--mantine-color-teal-1)' : undefined}
      style={
        selected ? { borderColor: 'var(--mantine-color-teal-5)' } : undefined
      }
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <Checkbox
          aria-label={`Tick ${suggestion.title}`}
          checked={checked}
          onChange={() => onToggle(suggestion.id)}
        />
        <UnstyledButton
          onClick={() => onSelect(suggestion.id)}
          aria-pressed={selected}
          aria-label={suggestion.title}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Text fw={600} size="sm" truncate="end">
              {suggestion.title}
            </Text>
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              {suggestion.starter ? (
                <Badge size="xs" radius={4} variant="filled" color="teal">
                  Top pick
                </Badge>
              ) : null}
              <Badge
                size="xs"
                radius={4}
                variant="light"
                color={ORIGIN_COLORS[suggestion.origin]}
                styles={{ label: { textTransform: 'none' } }}
              >
                {suggestion.displayLabel}
              </Badge>
            </Group>
          </Group>
          <Text size="xs" c="dimmed" truncate="end">
            {summary}
          </Text>
        </UnstyledButton>
      </Group>
      {detail ? <div style={{ marginTop: 8 }}>{detail}</div> : null}
    </Paper>
  )
})

/**
 * Context Builder's "Help me choose": what is worth a column, one compact
 * row each. Tick several and add them in one save, or select one to see its
 * preview and add, ignore or customise it alone.
 */
export function ContextAssistant({
  suggestions,
  loading,
  error,
  destination,
  busy,
  ignoredCount,
  addedCount,
  selectedId,
  onSelect,
  checkedIds,
  onCheckedChange,
  onAddMany,
  onIgnoreMany,
  onRestoreIgnored,
  selectedDetail,
  shots = [],
}: {
  suggestions: ColumnSuggestion[]
  loading: boolean
  error: string
  destination: string
  busy: boolean
  ignoredCount: number
  addedCount: number
  /** The row whose preview is shown. */
  selectedId: string | null
  onSelect: (id: string) => void
  checkedIds: string[]
  onCheckedChange: Dispatch<SetStateAction<string[]>>
  onAddMany: (suggestions: ColumnSuggestion[]) => void
  onIgnoreMany: (suggestions: ColumnSuggestion[]) => void
  onRestoreIgnored: () => void
  /** Shown under the selected row (narrow screens). */
  selectedDetail?: ReactNode
  shots?: HZDRShot[]
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = useMemo(
    () => (showAll ? suggestions : suggestions.slice(0, FIRST_SUGGESTIONS)),
    [showAll, suggestions]
  )
  const hidden = suggestions.length - shown.length
  // Each row's line is worked out once per list and campaign, not per render.
  const summaries = useMemo(
    () =>
      new Map(
        suggestions.map((suggestion) => [
          suggestion.id,
          suggestionSummary(suggestion, shots),
        ])
      ),
    [shots, suggestions]
  )
  // Ticks of suggestions no longer listed (added, ignored) do not count.
  const ticked = useMemo(() => {
    const ids = new Set(checkedIds)
    return suggestions.filter((suggestion) => ids.has(suggestion.id))
  }, [checkedIds, suggestions])
  const tickedIds = useMemo(
    () => new Set(ticked.map((suggestion) => suggestion.id)),
    [ticked]
  )
  const shownTicked = shown.filter((suggestion) =>
    tickedIds.has(suggestion.id)
  ).length

  const toggle = useCallback(
    (id: string) =>
      onCheckedChange((current) =>
        current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id]
      ),
    [onCheckedChange]
  )
  const tickAllShown = (tick: boolean) => {
    const shownIds = new Set(shown.map((suggestion) => suggestion.id))
    onCheckedChange((current) =>
      tick
        ? [...new Set([...current, ...shownIds])]
        : current.filter((id) => !shownIds.has(id))
    )
  }

  return (
    <Paper withBorder radius={4} p="sm" bg="var(--mantine-color-teal-0)">
      <Stack gap="sm">
        <Stack gap={2}>
          <Text size="sm" fw={700}>
            Suggested columns
          </Text>
          <Text size="xs" c="dimmed">
            Picked from what this campaign’s shots record. Tick the ones you
            want and add them to {destination} in one go, or select one to
            preview it first.
          </Text>
        </Stack>
        {loading ? (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs">Looking through the campaign’s records…</Text>
          </Group>
        ) : null}
        {error ? (
          <Text size="xs" c="red">
            {error}
          </Text>
        ) : null}
        {!loading && !suggestions.length ? (
          <Text size="sm">
            {addedCount || ignoredCount
              ? 'Nothing left to suggest: every suggestion is in your context file or ignored.'
              : 'Nothing to suggest yet: no recorded value varies from shot to shot. Use “Build a column myself” instead.'}
          </Text>
        ) : null}
        {suggestions.length ? (
          <Group justify="space-between" gap="xs">
            <Checkbox
              size="xs"
              label="Tick all shown"
              checked={shownTicked > 0 && shownTicked === shown.length}
              indeterminate={shownTicked > 0 && shownTicked < shown.length}
              onChange={(event) => tickAllShown(event.currentTarget.checked)}
            />
            <Group gap="xs">
              <Button
                size="xs"
                leftSection={<IconCheck size={14} />}
                disabled={!ticked.length || busy}
                onClick={() => onAddMany(ticked)}
              >
                {ticked.length
                  ? `Add ${ticked.length} column${ticked.length === 1 ? '' : 's'}`
                  : 'Add ticked columns'}
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconEyeOff size={14} />}
                disabled={!ticked.length}
                onClick={() => onIgnoreMany(ticked)}
              >
                Ignore ticked
              </Button>
            </Group>
          </Group>
        ) : null}
        <Stack gap={6}>
          {shown.map((suggestion) => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              summary={summaries.get(suggestion.id) ?? ''}
              checked={tickedIds.has(suggestion.id)}
              selected={suggestion.id === selectedId}
              detail={suggestion.id === selectedId ? selectedDetail : undefined}
              onToggle={toggle}
              onSelect={onSelect}
            />
          ))}
        </Stack>
        {hidden > 0 ? (
          <Button variant="light" size="xs" onClick={() => setShowAll(true)}>
            Show {hidden} more suggestion{hidden === 1 ? '' : 's'}
          </Button>
        ) : null}
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">
            {suggestions.length} to review
            {addedCount ? ` · ${addedCount} already in ${destination}` : ''}
            {ignoredCount ? ` · ${ignoredCount} ignored` : ''}
          </Text>
          {ignoredCount ? (
            <Button size="xs" variant="subtle" onClick={onRestoreIgnored}>
              Show ignored suggestions again
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  )
}
