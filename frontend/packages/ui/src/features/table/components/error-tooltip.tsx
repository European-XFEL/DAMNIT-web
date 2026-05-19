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
import {
  Arrow,
  type LayerProps,
  type LayerSide,
  type UseLayerArrowProps,
} from 'react-laag'

import { type VariableError } from '../../../types'
import { errorText, errorVisuals } from '../cells'

export type ErrorTooltipProps = {
  error: VariableError
  layerProps: LayerProps
  layerSide: LayerSide
  arrowProps: UseLayerArrowProps
  bridgePx: number
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const COPIED_RESET_MS = 1500

// Invisible hover-bridge covering the gap between the cell and the
// tooltip so that crossing it does not register as hovering an adjacent
// cell (which would otherwise switch the tooltip's target).
const bridgeStyle = (side: LayerSide, px: number): CSSProperties => {
  switch (side) {
    case 'bottom':
      return { position: 'absolute', top: -px, left: 0, right: 0, height: px }
    case 'top':
      return {
        position: 'absolute',
        bottom: -px,
        left: 0,
        right: 0,
        height: px,
      }
    case 'right':
      return { position: 'absolute', left: -px, top: 0, bottom: 0, width: px }
    case 'left':
      return { position: 'absolute', right: -px, top: 0, bottom: 0, width: px }
    default:
      return { display: 'none' }
  }
}

export const ErrorTooltip = ({
  error,
  layerProps,
  layerSide,
  arrowProps,
  bridgePx,
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
  const borderColor = 'var(--mantine-color-default-border)'

  useEffect(
    () => () => {
      window.clearTimeout(resetTimerRef.current)
    },
    []
  )

  useEffect(() => {
    window.clearTimeout(resetTimerRef.current)
    setCopied(false)
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

  return (
    <div
      ref={layerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        ...layerStyle,
        maxWidth: 360,
        background: surfaceColor,
        color: 'var(--mantine-color-white)',
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow:
          '0 0 0 1px var(--mantine-color-default-border), var(--mantine-shadow-md)',
      }}
    >
      <div style={bridgeStyle(layerSide, bridgePx)} />
      <Arrow
        {...arrowProps}
        backgroundColor={surfaceColor}
        borderColor={borderColor}
        borderWidth={1}
        size={6}
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
