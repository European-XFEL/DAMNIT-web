import { useState } from 'react';
import { Checkbox, Stack, Group, Text, AccordionItem, AccordionControl, AccordionPanel } from '@mantine/core';
import { useAppSelector } from '../../redux';

export interface SpoilerListProps {
  tagId?: number;
  tagName?: string;
  toggleOne: (varName: string) => void;
  toggleAll: (columnNames: string[], isVisible: boolean) => void;
}

function SpoilerList({ tagId, tagName, toggleAll, toggleOne }: SpoilerListProps) {
  const variables = useAppSelector(state => state.tableData.metadata.variables);
  const visibleColumns = useAppSelector(state => state.visibilitySettings.visibleColumns);

  function varListForTagId(tagId: number): string[] {
    const varList = Object.keys(variables).filter((varName) => {
      const varTags = variables[varName].tag_ids;
      return varTags.includes(tagId);
    });
    return varList;
  }

  const varList = varListForTagId(tagId);

  const allOn = varList.every(v => visibleColumns[v]);
  const anyOn = varList.some(v => visibleColumns[v]);

  return (

      <AccordionItem value={tagId?.toString() ?? "All Variables"}>
        <AccordionControl>
          <Group>
        <Checkbox
          checked={allOn && anyOn}
          indeterminate={!allOn && anyOn}
          onClick={(event) => {event.stopPropagation(); toggleAll(varList, !allOn)}}
        />
        <Text fw={600}>{tagName}</Text>
        </Group>
        </AccordionControl>
      <AccordionPanel>      
      <Stack gap={4}>
        {varList.map(v => (
          <Checkbox
            key={v}
            label={v}
            checked={visibleColumns[v]}
            onChange={() => toggleOne(v)}
            radius="sm"
          />
        ))}
      </Stack>
      </AccordionPanel>
    </AccordionItem>
  );
}

export default SpoilerList;