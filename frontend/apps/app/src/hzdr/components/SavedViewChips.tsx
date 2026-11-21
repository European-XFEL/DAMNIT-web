import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  Popover,
  Text,
  TextInput,
} from '@mantine/core'
import { IconX } from '@tabler/icons-react'

import {
  type SavedTableView,
  deleteTableView,
  fetchSavedTableViews,
  saveTableView,
} from '../utils/saved-views'
import type { ShotTableView } from '../utils/table-view'

function sameView(left: ShotTableView, right: ShotTableView) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Named table views as chips above the table: one click applies a view
 * (filter, sort, columns), "Save view" names the current one. Stored per
 * user by the API beside the catalog; nothing shows where the API keeps no
 * views (a Mongo-backed deployment).
 */
export function SavedViewChips({
  sourceKey,
  currentView,
  onApply,
}: {
  sourceKey: string
  currentView: ShotTableView
  onApply: (view: ShotTableView) => void
}) {
  const [views, setViews] = useState<SavedTableView[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    let current = true
    setViews(null)
    fetchSavedTableViews(sourceKey)
      .then((loaded) => current && setViews(loaded))
      .catch(() => current && setViews(null))
    return () => {
      current = false
    }
  }, [sourceKey])

  if (views === null) return null

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    saveTableView(sourceKey, trimmed, currentView)
      .then((saved) => {
        setViews((existing) => [
          ...(existing ?? []).filter((view) => view.name !== saved.name),
          saved,
        ])
        setNaming(false)
        setName('')
        setError(undefined)
      })
      .catch(() => setError('Could not save the view.'))
  }

  const remove = (view: SavedTableView) => {
    deleteTableView(sourceKey, view.id)
      .then(() =>
        setViews((existing) =>
          (existing ?? []).filter((entry) => entry.id !== view.id)
        )
      )
      .catch(() => setError(`Could not delete "${view.name}".`))
  }

  return (
    <Group gap={6} mb="sm" wrap="wrap" aria-label="Saved views">
      <Text size="xs" c="dimmed">
        Views
      </Text>
      {views.map((view) => {
        const active = sameView(view.view, currentView)
        return (
          <Group key={view.id} gap={0} wrap="nowrap">
            <Button
              size="compact-xs"
              radius="xl"
              variant={active ? 'filled' : 'light'}
              aria-pressed={active}
              onClick={() => onApply(view.view)}
            >
              {view.name}
            </Button>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              aria-label={`Delete view ${view.name}`}
              onClick={() => remove(view)}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
        )
      })}
      <Popover
        opened={naming}
        onChange={setNaming}
        position="bottom-start"
        withArrow
        trapFocus
      >
        <Popover.Target>
          <Button
            size="compact-xs"
            radius="xl"
            variant="subtle"
            onClick={() => setNaming((open) => !open)}
          >
            Save view
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <TextInput
                size="xs"
                label="View name"
                placeholder="e.g. Good shots, energy first"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={80}
              />
              <Button size="xs" type="submit" disabled={!name.trim()}>
                Save
              </Button>
            </Group>
          </form>
        </Popover.Dropdown>
      </Popover>
      {error ? (
        <Text size="xs" c="red">
          {error}
        </Text>
      ) : null}
    </Group>
  )
}
