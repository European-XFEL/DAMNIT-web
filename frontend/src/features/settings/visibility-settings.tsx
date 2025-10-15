import {
  Accordion,
  Button,
  rem,
  ScrollArea,
  Stack,
  TextInput,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'

import { VISIBILITY_EXCLUDED_VARIABLES } from '../../constants'
import { useAppDispatch, useAppSelector } from '../../redux'
import type { TagItem } from '../../types'
import { setVariablesVisibility } from '../table/table.slice'
import VisibilitySettingsItem from './visibility-settings-item'

export interface VisibilitySettingsProps {
  variant: 'all-variables' | 'tag-variables'
}

function VisibilitySettings({
  variant = 'tag-variables',
}: VisibilitySettingsProps) {
  const dispatch = useAppDispatch()
  const { tags, variables: originalVariables } = useAppSelector(
    (state) => state.tableData.metadata
  )
  const variableVisibility = useAppSelector(
    (state) => state.table.variableVisibility
  )

  const variables = useMemo(() => {
    return Object.fromEntries(
      Object.entries(originalVariables).filter(
        ([key]) => !VISIBILITY_EXCLUDED_VARIABLES.includes(key)
      )
    )
  }, [originalVariables])

  const allVarNames = useMemo(() => Object.keys(variables), [variables])
  const allOn =
    allVarNames.length > 0 &&
    allVarNames.every((v) => variableVisibility[v] !== false)

  const [searchTerm, setSearchTerm] = useState('')
  const [openedAccordions, setOpenedAccordions] = useState(
    !Object.keys(tags).length ? ['all-variables'] : []
  )

  const filteredVariableNames = useMemo(() => {
    if (!searchTerm) {
      return undefined
    }
    const lowerCaseSearch = searchTerm.toLowerCase()
    return Object.values(variables)
      .filter((v) => v.title?.toLowerCase().includes(lowerCaseSearch))
      .map((v) => v.name)
  }, [variables, searchTerm])

  const visibleTags = useMemo<TagItem[]>(() => {
    if (variant !== 'tag-variables') return []
    return Object.values(tags).filter((tag) => {
      if (!filteredVariableNames) return true
      return Object.values(variables).some(
        (v) =>
          v.tag_ids.includes(tag.id) && filteredVariableNames.includes(v.name)
      )
    })
  }, [variant, tags, variables, filteredVariableNames])

  useEffect(() => {
    if (variant !== 'tag-variables') return
    if (searchTerm) {
      const idsToOpen = visibleTags.map((tag) => tag.id.toString())
      if (filteredVariableNames && filteredVariableNames.length > 0) {
        setOpenedAccordions(idsToOpen)
      }
    } else {
      setOpenedAccordions([])
    }
  }, [variant, searchTerm, visibleTags, filteredVariableNames])

  const getVarCount = (tagId?: number) => {
    if (tagId) {
      return Object.values(variables).filter((v) => v.tag_ids.includes(tagId))
        .length
    } else {
      return Object.keys(variables).length
    }
  }

  return (
    <Stack gap="md" h="100%">
      <TextInput
        placeholder="Search variables..."
        leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setSearchTerm('')
          }
        }}
      />
      <Button
        variant="light"
        onClick={() => {
          const updates = Object.fromEntries(
            allVarNames.map((name) => [name, !allOn])
          )
          dispatch(setVariablesVisibility(updates))
        }}
        disabled={allVarNames.length === 0}
      >
        {allOn ? 'Deselect all' : 'Select all'}
      </Button>

      <ScrollArea style={{ flex: 1 }}>
        <Accordion
          variant="separated"
          multiple
          value={
            variant === 'all-variables' ? 'all-variables' : openedAccordions
          }
          chevron={variant === 'all-variables' ? null : true}
          onChange={setOpenedAccordions}
        >
          {variant === 'all-variables' && (
            <VisibilitySettingsItem
              key={'all'}
              filteredVariableNames={filteredVariableNames}
              variableCount={getVarCount()}
            />
          )}

          {variant === 'tag-variables' && (
            <>
              {visibleTags.map((tag) => (
                <VisibilitySettingsItem
                  key={tag.id}
                  tagId={tag.id}
                  tagName={tag.name}
                  filteredVariableNames={filteredVariableNames}
                  variableCount={getVarCount(tag.id)}
                />
              ))}
            </>
          )}
        </Accordion>
      </ScrollArea>
    </Stack>
  )
}

export default VisibilitySettings
