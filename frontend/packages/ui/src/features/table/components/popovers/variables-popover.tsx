import { Badge, Button, Group, Text } from '@mantine/core'
import { IconList } from '@tabler/icons-react'

import type { Field } from './field-settings'
import { FieldsPopover } from './fields-popover'
import { NONCONFIGURABLE_VARIABLES } from '../../constants'
import { selectVariableVisibility } from '../../store/selectors'
import { setVariableVisibility } from '../../table.slice'

import { useAppDispatch, useAppSelector } from '../../../../redux/hooks'

export function VariablesPopover() {
  const dispatch = useAppDispatch()
  const metadata = useAppSelector((state) => state.tableData.metadata.variables)
  const visibility = useAppSelector(selectVariableVisibility)

  const fields = Object.values(metadata)
    .filter((meta) => !NONCONFIGURABLE_VARIABLES.includes(meta.name))
    .map(
      (meta) =>
        ({
          name: meta.name,
          title: meta.title ?? meta.name,
          isVisible: visibility[meta.name] !== false,
        }) as Field
    )

  const notVisibleCount = fields.filter((f) => !f.isVisible).length

  return (
    <FieldsPopover
      renderTarget={({ opened, toggle }) => (
        <Button
          variant={opened ? 'light' : 'white'}
          color="gray"
          c="black"
          size="xs"
          leftSection={<IconList size={14} />}
          onClick={toggle}
        >
          <Group gap={6}>
            <Text size="xs" fw={500}>
              Variables
            </Text>
            {notVisibleCount && (
              <Badge
                variant="light"
                size="sm"
                radius="sm"
              >{`-${notVisibleCount}`}</Badge>
            )}
          </Group>
        </Button>
      )}
      fields={fields}
      onVisibilityChange={(visibility) => {
        dispatch(setVariableVisibility(visibility))
      }}
    />
  )
}
