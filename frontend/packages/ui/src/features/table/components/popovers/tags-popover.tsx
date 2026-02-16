import { useMemo } from 'react'
import { isEmpty } from 'lodash'
import { IconHash } from '@tabler/icons-react'

import type { Field } from './field-settings'
import { FieldsPopover } from './fields-popover'
import { ControlButton } from '../control-button'
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
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={IconHash}
          label="Tags"
          badgeCount={selectionCount}
        />
      )}
      fields={fields}
      onVisibilityChange={handleVisibilityChange}
    />
  )
}
