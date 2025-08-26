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

  const varList = tagId ? varListForTagId(tagId) : Object.keys(variables);

  const allOn = varList.every(v => visibleColumns[v]);
  const anyOn = varList.some(v => visibleColumns[v]);

  return (

      <AccordionItem value={tagId?.toString() ?? "all-variables"}>
        <AccordionControl>
          <Group>
      { tagId && <Checkbox
        checked={allOn && anyOn}
        indeterminate={!allOn && anyOn}
        onChange={() => {}}
        onClick={(event) => {event.stopPropagation(); toggleAll(varList, !allOn)}}
      />}
        <Text fw={600}>{tagName ?? "All Variables"}</Text>
        </Group>
        </AccordionControl>
      <AccordionPanel>      
      <Stack gap={4}>
        {varList.map(v => (
          <Checkbox
            key={v}
            label={variables[v].title}
            checked={visibleColumns[v]}
            onClick={() => toggleOne(v)}
            onChange={() => {}}
            radius="sm"
          />
        ))}
      </Stack>
      </AccordionPanel>
    </AccordionItem>
  );
}

export default SpoilerList;