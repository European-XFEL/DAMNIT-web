import {
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Checkbox,
  Group,
  rem,
  Stack,
  Text,
} from '@mantine/core'
import { VISIBILITY_EXCLUDED_VARIABLES } from '../../constants'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { setVariableVisibility } from '../table/table.slice'
import { selectVariableVisibility } from '../table/store/selectors'

export interface VisibilitySettingsItemProps {
  tagId?: number
  tagName?: string
  variableCount?: number
  filteredVariableNames?: string[]
  isUntagged?: boolean
}

function VisibilitySettingsItem({
  tagId,
  tagName,
  variableCount,
  filteredVariableNames,
  isUntagged = false,
}: VisibilitySettingsItemProps) {
  const dispatch = useAppDispatch()
  const { variables } = useAppSelector((state) => state.tableData.metadata)
  const variableVisibility = useAppSelector(selectVariableVisibility)

  function varListForTagId(tagId: number): string[] {
    return Object.keys(variables).filter((varName) =>
      variables[varName].tag_ids.includes(tagId)
    )
  }

  const groupVarList = tagId
    ? varListForTagId(tagId)
    : isUntagged
      ? Object.keys(variables).filter(
          (varName) =>
            !VISIBILITY_EXCLUDED_VARIABLES.includes(varName) &&
            variables[varName].tag_ids.length === 0
        )
      : Object.keys(variables).filter(
          (v) => !VISIBILITY_EXCLUDED_VARIABLES.includes(v)
        )

  const varList =
    filteredVariableNames !== undefined
      ? groupVarList.filter((v) => filteredVariableNames.includes(v))
      : groupVarList

  const allOn =
    varList.length > 0 && varList.every((v) => variableVisibility[v] !== false)
  const anyOn = varList.some((v) => variableVisibility[v] !== false)
  const isIndeterminate = anyOn && !allOn

  if (filteredVariableNames !== undefined && varList.length === 0) {
    return null
  }

  return (
    <AccordionItem
      value={tagId?.toString() ?? (isUntagged ? 'untagged' : 'all-variables')}
    >
      <Box pos="relative">
        {(tagId || isUntagged) && (
          // We need to remount the checkbox when using the `indeterminate`
          // prop due to a Mantine bug: the `CheckboxIcon` child component
          // is falsely rendered with `indeterminate=false`
          <Checkbox
            key={`checkbox-${tagName}-all-${isIndeterminate}`}
            checked={allOn}
            indeterminate={isIndeterminate}
            onChange={() => {}}
            onClick={(event) => {
              event.stopPropagation()
              const updates = Object.fromEntries(
                groupVarList.map((name) => [name, event.currentTarget.checked])
              )
              dispatch(setVariableVisibility(updates))
            }}
            color="indigo"
            style={{
              position: 'absolute',
              left: rem(12),
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1,
            }}
          />
        )}
        <AccordionControl pl={rem(42)}>
          <Group justify="space-between">
            <Text fw={600} size="sm">
              {tagName ?? 'All Variables'}
            </Text>
            {variableCount !== undefined && (
              <Badge mx={rem(12)} variant="light" color="indigo">
                {variableCount}
              </Badge>
            )}
          </Group>
        </AccordionControl>
      </Box>
      <AccordionPanel>
        <Stack gap={4}>
          {varList.map((v) => (
            <Checkbox
              key={v}
              label={variables[v].title}
              checked={variableVisibility[v] !== false}
              onClick={(event) =>
                dispatch(
                  setVariableVisibility({ [v]: event.currentTarget.checked })
                )
              }
              onChange={() => {}}
              radius="sm"
              color="indigo"
            />
          ))}
        </Stack>
      </AccordionPanel>
    </AccordionItem>
  )
}

export default VisibilitySettingsItem
