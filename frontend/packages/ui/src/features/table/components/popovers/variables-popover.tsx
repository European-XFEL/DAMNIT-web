import { IconList } from '@tabler/icons-react'

import type { Field } from './field-settings'
import { FieldsPopover } from './fields-popover'
import { ControlButton } from '../control-button'
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
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={IconList}
          label="Variables"
          badgeCount={notVisibleCount * -1}
        />
      )}
      fields={fields}
      onVisibilityChange={(visibility) => {
        dispatch(setVariableVisibility(visibility))
      }}
    />
  )
}
