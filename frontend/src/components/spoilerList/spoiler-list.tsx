import {
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Badge,
  Checkbox,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useAppDispatch, useAppSelector } from '../../redux'
import { EXCLUDED_VARIABLES } from '../../constants'
import {
  setVariableGroupVisibility,
  toggleVariableVisibility,
} from '../../features/table/table.slice'

export interface SpoilerListProps {
  tagId?: number
  tagName?: string
  variableCount?: number
  filteredVars?: string[]
}

function SpoilerList({
  tagId,
  tagName,
  variableCount,
  filteredVars,
}: SpoilerListProps) {
  const dispatch = useAppDispatch()
  const { variables } = useAppSelector((state) => state.tableData.metadata)
  const { variableVisibility } = useAppSelector((state) => state.table)

  function varListForTagId(tagId: number): string[] {
    return Object.keys(variables).filter((varName) =>
      variables[varName].tag_ids.includes(tagId)
    )
  }

  const groupVarList = tagId
    ? varListForTagId(tagId)
    : Object.keys(variables).filter((v) => !EXCLUDED_VARIABLES.includes(v))

  const varList =
    filteredVars !== undefined
      ? groupVarList.filter((v) => filteredVars.includes(v))
      : groupVarList

  const allOn =
    varList.length > 0 && varList.every((v) => variableVisibility[v] !== false)
  const anyOn = varList.some((v) => variableVisibility[v] !== false)
  const isIndeterminate = anyOn && !allOn

  let tooltipLabel = 'Select all variables in this group'
  if (allOn) {
    tooltipLabel = 'Deselect all variables in this group'
  } else if (isIndeterminate) {
    tooltipLabel = 'Some variables are selected. Click to deselect all.'
  }

  if (filteredVars !== undefined && varList.length === 0) {
    return null
  }

  return (
    <AccordionItem value={tagId?.toString() ?? 'all-variables'}>
      <AccordionControl>
        <Group justify="space-between">
          <Group>
            {tagId && (
              <Tooltip label={tooltipLabel} withArrow position="right">
                <Checkbox
                  key={`${tagId}-${isIndeterminate}`}
                  checked={allOn}
                  indeterminate={isIndeterminate}
                  onChange={() => {}}
                  onClick={(event) => {
                    event.stopPropagation()
                    dispatch(
                      setVariableGroupVisibility({
                        variableNames: groupVarList,
                        isVisible: !anyOn,
                      })
                    )
                  }}
                />
              </Tooltip>
            )}
            <Text fw={600}>{tagName ?? 'All Variables'}</Text>
          </Group>
          {variableCount !== undefined && (
            <Badge variant="light">{variableCount}</Badge>
          )}
        </Group>
      </AccordionControl>
      <AccordionPanel>
        <Stack gap={4}>
          {varList.map((v) => (
            <Checkbox
              key={v}
              label={variables[v].title}
              checked={variableVisibility[v] !== false}
              onClick={() => dispatch(toggleVariableVisibility(v))}
              onChange={() => {}}
              radius="sm"
            />
          ))}
        </Stack>
      </AccordionPanel>
    </AccordionItem>
  )
}

export default SpoilerList
