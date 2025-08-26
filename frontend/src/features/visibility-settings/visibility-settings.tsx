import { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Group,
  rem,
  ScrollArea,
  Stack,
  TextInput,
  Title,
} from '@mantine/core'
import { IconEye, IconSearch } from '@tabler/icons-react'

import { SpoilerList } from '../../components/spoilerList'
import { useAppDispatch, useAppSelector } from '../../redux'
import {
  setColumnGroupVisibility,
  toggleColumnVisibility,
} from './visibility-settings.slice'
import { EXCLUDED_VARIABLES } from '../../constants'

function VisibilitySettings() {
  const dispatch = useAppDispatch()
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

  function toggleOne(variableName: string) {
    dispatch(toggleColumnVisibility(variableName))
  }

  function toggleAll(columnNames: string[], isVisible: boolean) {
    dispatch(setColumnGroupVisibility({ columnNames, isVisible }))
  }

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
      <Group gap="xs">
        <IconEye style={{ width: rem(24), height: rem(24) }} stroke={1.5} />
        <Title order={4}>Column Visibility</Title>
      </Group>

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
          value={openedAccordions}
          onChange={setOpenedAccordions}
        >
          <SpoilerList
            key={'all'}
            toggleOne={toggleOne}
            toggleAll={toggleAll}
            filteredVars={filteredVariableNames}
            variableCount={getVarCount()}
          />

          {visibleTags.map((tag) => (
            <SpoilerList
              key={tag.id}
              tagId={tag.id}
              tagName={tag.name}
              toggleOne={toggleOne}
              toggleAll={toggleAll}
              variableCount={getVarCount(tag.id)}
              filteredVars={filteredVariableNames}
            />
          ))}
        </Accordion>
      </ScrollArea>
    </Stack>
  )
}

export default VisibilitySettings
