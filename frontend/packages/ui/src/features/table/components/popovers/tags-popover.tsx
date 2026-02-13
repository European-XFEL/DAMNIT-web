import { useMemo } from 'react'
import { isEmpty } from 'lodash'
import { Badge, Button, Group, Text } from '@mantine/core'
import { IconHash } from '@tabler/icons-react'

import type { Field } from './field-settings'
import { FieldsPopover } from './fields-popover'
import { selectTagSelection } from '../../store/selectors'
import { setTagSelection } from '../../table.slice'

import { useAppDispatch, useAppSelector } from '../../../../redux/hooks'

export function TagsPopover() {
  const dispatch = useAppDispatch()
  const tags = useAppSelector((state) => state.tableData.metadata.tags)
  const selection = useAppSelector(selectTagSelection)

  const sorted = useMemo(
    () =>
      Object.values(tags).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [tags]
  )

  if (isEmpty(tags)) {
    return null
  }

  const fields = sorted.map(
    (tag) =>
      ({
        name: tag.name,
        title: tag.name,
        isVisible: !!selection[tag.name],
      }) as Field
  )

  const selectionCount = fields.filter((f) => f.isVisible).length
  function handleVisibilityChange(selection: Record<string, boolean>) {
    dispatch(setTagSelection(selection))
  }

  return (
    <FieldsPopover
      renderTarget={({ opened, toggle }) => (
        <Button
          variant={opened ? 'light' : 'white'}
          color="gray"
          c="black"
          size="xs"
          leftSection={<IconHash size={14} />}
          onClick={toggle}
        >
          <Group gap={6}>
            <Text size="xs" fw={500}>
              Tags
            </Text>
            {selectionCount && (
              <Badge variant="light" size="sm" radius="sm">
                {selectionCount}
              </Badge>
            )}
          </Group>
        </Button>
      )}
      fields={fields}
      onVisibilityChange={handleVisibilityChange}
    />
  )
}
