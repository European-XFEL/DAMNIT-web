import { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  rem,
  ScrollArea,
  Stack,
  TextInput,
  Divider,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

import { SpoilerList } from '../../components/spoiler-list'
import { useAppSelector } from '../../redux'
import { EXCLUDED_VARIABLES } from '../../constants'

export interface VisibilitySettingsProps {
  variant: 'all-variables' | 'tag-variables'
}

function VisibilitySettings({
  variant = 'tag-variables',
}: VisibilitySettingsProps) {
  const { tags, variables: originalVariables } = useAppSelector(
    (state) => state.tableData.metadata
  )

  const variables = useMemo(() => {
    return Object.fromEntries(
      Object.entries(originalVariables).filter(
        ([key]) => !EXCLUDED_VARIABLES.includes(key)
      )
    )
  }, [originalVariables])

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

  const filteredVarsSet = useMemo(
    () => (filteredVariableNames ? new Set(filteredVariableNames) : undefined),
    [filteredVariableNames]
  )

  const visibleTags = useMemo(
    () =>
      Object.values(tags).filter((tag) => {
        if (!filteredVarsSet) {
          return true
        }
        return Object.values(variables).some(
          (v) => v.tag_ids.includes(tag.id) && filteredVarsSet.has(v.name)
        )
      }),
    [tags, variables, filteredVarsSet]
  )

  useEffect(() => {
    if (searchTerm) {
      const idsToOpen = visibleTags.map((tag) => tag.id.toString())
      if (filteredVariableNames && filteredVariableNames.length > 0) {
        setOpenedAccordions(['all-variables', ...idsToOpen])
      } else {
        setOpenedAccordions(idsToOpen)
      }
    } else {
      setOpenedAccordions(!Object.keys(tags).length ? ['all-variables'] : [])
    }
  }, [searchTerm, visibleTags, filteredVariableNames, tags])

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
            <SpoilerList
              key={'all'}
              filteredVars={filteredVariableNames}
              variableCount={getVarCount()}
            />
          )}

          {variant === 'tag-variables' && (
            <>
              <Divider my="sm" label="Tags" labelPosition="center" />
              {visibleTags.map((tag) => (
                <SpoilerList
                  key={tag.id}
                  tagId={tag.id}
                  tagName={tag.name}
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
