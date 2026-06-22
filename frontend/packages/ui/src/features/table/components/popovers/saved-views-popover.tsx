import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconDeviceFloppy,
  IconEye,
  IconTrash,
} from '@tabler/icons-react'

import { BasePopover } from './base-popover'
import { ControlButton } from '../control-button'
import { useColumnVisibilityFromVariables } from '../../hooks/use-column-visibility'
import {
  selectTagSelection,
  selectVariableVisibility,
} from '../../store/selectors'
import { setTagSelection, setVariableVisibility } from '../../table.slice'

import { HTTP_URL } from '../../../../constants'
import { useAppDispatch, useAppSelector } from '../../../../redux/hooks'

type RuntimeConfig = {
  profile: string
}

type SavedViewState = {
  variable_visibility?: Record<string, boolean>
  tag_selection?: Record<string, boolean>
}

type SavedView = {
  id: string
  name: string
  state: SavedViewState
  updated_at: string
}

type SavedViewsPopoverProps = {
  sourceKey: string | number | null | undefined
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail ?? 'Saved views are not available.')
  }

  return response.json() as Promise<T>
}

function useHzdrSavedViewsEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchJson<RuntimeConfig>(`${HTTP_URL}config/runtime`)
      .then((config) => {
        if (!cancelled) {
          setEnabled(config.profile === 'hzdr')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return enabled
}

function SavedViewsPanel({ sourceKey }: SavedViewsPopoverProps) {
  const dispatch = useAppDispatch()
  const variableVisibility = useAppSelector(selectVariableVisibility)
  const completeVariableVisibility = useColumnVisibilityFromVariables()
  const tagSelection = useAppSelector(selectTagSelection)
  const [views, setViews] = useState<SavedView[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)

  const endpoint = useMemo(() => {
    if (sourceKey == null || sourceKey === '') {
      return null
    }
    return `${HTTP_URL}metadata/hzdr/sources/${encodeURIComponent(String(sourceKey))}/views`
  }, [sourceKey])

  const loadViews = useCallback(async () => {
    if (!endpoint) {
      return
    }

    setIsLoading(true)
    setError(undefined)
    try {
      setViews(await fetchJson<SavedView[]>(endpoint))
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Saved views failed to load.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    void loadViews()
  }, [loadViews])

  const saveView = async () => {
    if (!endpoint || !name.trim()) {
      return
    }

    setIsLoading(true)
    setError(undefined)
    try {
      const saved = await fetchJson<SavedView>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          state: {
            variable_visibility: {
              ...completeVariableVisibility,
              ...variableVisibility,
            },
            tag_selection: tagSelection,
          },
        }),
      })
      setViews((current) => [
        saved,
        ...current.filter((view) => view.id !== saved.id),
      ])
      setName('')
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Saved view was not saved.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const openView = (view: SavedView) => {
    if (view.state.variable_visibility) {
      dispatch(setVariableVisibility(view.state.variable_visibility))
    }
    if (view.state.tag_selection) {
      dispatch(setTagSelection(view.state.tag_selection))
    }
  }

  const deleteView = async (view: SavedView) => {
    if (!endpoint) {
      return
    }

    setIsLoading(true)
    setError(undefined)
    try {
      await fetchJson(`${endpoint}/${encodeURIComponent(view.id)}`, {
        method: 'DELETE',
      })
      setViews((current) => current.filter((item) => item.id !== view.id))
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Saved view was not deleted.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Stack gap="sm" p="sm" w={320} pos="relative">
      <LoadingOverlay visible={isLoading} />
      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />} py={6}>
          {error}
        </Alert>
      ) : null}
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TextInput
          label="Name"
          placeholder="Current view"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          size="xs"
          flex={1}
        />
        <Button
          size="xs"
          onClick={saveView}
          disabled={!endpoint || !name.trim()}
        >
          Save
        </Button>
      </Group>
      <Divider />
      <ScrollArea.Autosize mah={260} type="auto">
        <Stack gap={4}>
          {views.length ? (
            views.map((view) => (
              <Group
                key={view.id}
                justify="space-between"
                gap="xs"
                wrap="nowrap"
              >
                <Text size="sm" truncate>
                  {view.name}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    aria-label={`Open ${view.name}`}
                    variant="subtle"
                    color="indigo"
                    size="sm"
                    onClick={() => openView(view)}
                  >
                    <IconEye size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label={`Delete ${view.name}`}
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => void deleteView(view)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No saved views.
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  )
}

export function SavedViewsPopover({ sourceKey }: SavedViewsPopoverProps) {
  const enabled = useHzdrSavedViewsEnabled()

  if (!enabled) {
    return null
  }

  return (
    <BasePopover
      renderTarget={({ opened, toggle }) => (
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={IconDeviceFloppy}
          label="Views"
          badgeCount={0}
        />
      )}
    >
      <SavedViewsPanel sourceKey={sourceKey} />
    </BasePopover>
  )
}
