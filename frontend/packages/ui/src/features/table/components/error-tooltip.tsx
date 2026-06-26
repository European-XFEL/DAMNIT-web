import { type CSSProperties, useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Group,
  ScrollArea,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { Arrow, type LayerProps, type UseLayerArrowProps } from 'react-laag'

import { type VariableError } from '../../../types'
import { errorText, errorVisuals } from '../cells'
import classes from '../table-tooltip.module.css'

export type ErrorTooltipProps = {
  error: VariableError
  layerProps: LayerProps
  arrowProps: UseLayerArrowProps
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const COPIED_RESET_MS = 1500

export const ErrorTooltip = ({
  error,
  layerProps,
  arrowProps,
  onMouseEnter,
  onMouseLeave,
}: ErrorTooltipProps) => {
  const { kind, title } = errorVisuals(error.cls)
  const accent = kind === 'error' ? 'red.4' : 'gray.4'
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number>(0)
  const theme = useMantineTheme()
  const scheme = useComputedColorScheme('light')
  const surfaceColor =
    scheme === 'dark' ? theme.colors.dark[5] : theme.colors.dark[7]

  useEffect(() => {
    window.clearTimeout(resetTimerRef.current)
    setCopied(false)
    return () => {
      window.clearTimeout(resetTimerRef.current)
    }
  }, [error])

  const handleCopy = () => {
    void navigator.clipboard.writeText(errorText(error)).then(() => {
      setCopied(true)
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(
        () => setCopied(false),
        COPIED_RESET_MS
      )
    })
  }

  const { ref: layerRef, style: layerStyle } = layerProps
  const style = {
    ...layerStyle,
    '--table-tooltip-bg': surfaceColor,
  } as CSSProperties

  return (
    <div
      ref={layerRef}
      className={`${classes.surface} ${classes.errorTooltip}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      <Arrow
        {...arrowProps}
        backgroundColor={surfaceColor}
        borderWidth={0}
        size={10}
      />
      <Group justify="space-between" gap="md" wrap="nowrap" mb={4}>
        <div>
          <Text size="xs" fw={700} c={accent}>
            {title}
          </Text>
          <Text size="xs" c="gray.5" style={{ fontFamily: 'monospace' }}>
            {error.cls}
          </Text>
        </div>
        <Tooltip
          label={copied ? 'Copied' : 'Copy'}
          withArrow
          styles={{ tooltip: { fontSize: 10, padding: '2px 6px' } }}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <IconCheck size={14} color="var(--mantine-color-teal-4)" />
            ) : (
              <IconCopy size={14} />
            )}
          </ActionIcon>
        </Tooltip>
      </Group>
      <ScrollArea.Autosize mah={200} type="auto">
        <Text
          size="xs"
          style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
        >
          {error.message}
        </Text>
      </ScrollArea.Autosize>
    </div>
  )
}
