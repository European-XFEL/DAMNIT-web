import { useEffect, useMemo, useState } from 'react'
import type {
  DrawHeaderCallback,
  Highlight,
  Theme,
} from '@glideapps/glide-data-grid'

import { useAppSelector } from '#src/app/store/hooks'
import { selectLastMove } from '#src/features/table/stores/table.selectors'
import type { ColumnIndex } from '#src/features/table/utils/grid-selection'

// Full strength while the eye travels from the popover to the grid.
const FLASH_HOLD = 200
// Then an ease-out to nothing.
const FLASH_FADE = 800
const FLASH_DURATION = FLASH_HOLD + FLASH_FADE

// Glide's accentLight, the tint a selected column wears, at 2.5 times its alpha.
const FLASH_RGB = '62, 116, 253'
const FLASH_PEAK = 0.25

// Glide's own curve for its hover fades.
function easeOutCubic(progress: number) {
  return (progress - 1) ** 3 + 1
}

function flashStrength(elapsed: number) {
  if (elapsed < FLASH_HOLD) {
    return 1
  }
  return 1 - easeOutCubic((elapsed - FLASH_HOLD) / FLASH_FADE)
}

// Tints what the last move put somewhere new, then fades it. A new
// highlightRegions each frame is what makes Glide repaint the headers and band.
export function useColumnFlash(columnIndex: ColumnIndex, rowCount: number) {
  const lastMove = useAppSelector(selectLastMove)

  // Tagged with the stamp it belongs to, so a strength left over from an
  // earlier move is never drawn on this one.
  const [fade, setFade] = useState<{ at: number; strength: number } | null>(
    null
  )

  const indices = useMemo(() => {
    const found = new Set<number>()
    for (const name of lastMove?.columns ?? []) {
      const index = columnIndex.get(name)
      if (index != null) {
        found.add(index)
      }
    }
    return found
  }, [lastMove, columnIndex])
  const tinted = indices.size > 0

  useEffect(() => {
    if (lastMove == null || !tinted) {
      return
    }

    let frame = 0
    const tick = () => {
      // A stamp already this old draws nothing: the Plots tab unmounts the
      // table, and a remount would otherwise replay the last drop.
      const elapsed = performance.now() - lastMove.at
      if (elapsed >= FLASH_DURATION) {
        setFade(null)
        return
      }
      const strength = flashStrength(elapsed)
      // The hold draws the same strength each frame, and the grid need not
      // render for it.
      setFade((current) =>
        current?.at === lastMove.at && current.strength === strength
          ? current
          : { at: lastMove.at, strength }
      )
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setFade(null)
    }
  }, [lastMove, tinted])

  const strength =
    fade != null && fade.at === lastMove?.at ? fade.strength : null

  return useMemo(() => {
    if (strength == null || lastMove == null || !tinted) {
      return {
        highlightRegions: undefined,
        drawHeader: undefined,
        groupThemes: undefined,
      }
    }

    const color = `rgba(${FLASH_RGB}, ${strength * FLASH_PEAK})`
    const groups = new Set(lastMove.groups)

    // Glide has no draw callback for the band, only a theme per group, which
    // also fills the headers of that group's columns.
    const groupThemes: Record<string, Partial<Theme>> | undefined =
      groups.size > 0
        ? Object.fromEntries(
            [...groups].map((group) => [group, { bgHeader: color }])
          )
        : undefined

    // One region per column, so a group need not be contiguous to flash whole.
    const highlightRegions: Highlight[] = [...indices].map((index) => ({
      color,
      range: { x: index, y: 0, width: 1, height: rowCount },
      style: 'no-outline',
    }))

    // Under the title, which stays crisp. Glide fills a hovered or selected
    // header first, so the tint lands on top of that fill too.
    const drawHeader: DrawHeaderCallback = (
      {
        ctx,
        theme,
        rect,
        column,
        columnIndex: index,
        isSelected,
        hasSelectedCell,
        hoverAmount,
      },
      drawContent
    ) => {
      const tintedByGroup = column.group != null && groups.has(column.group)
      const coveredByGlide = isSelected || hasSelectedCell || hoverAmount > 0
      if (tintedByGroup) {
        // Glide draws the title of a themed column in the cell font.
        ctx.font = `${theme.headerFontStyle} ${theme.fontFamily}`
      }
      if (indices.has(index) && (!tintedByGroup || coveredByGlide)) {
        ctx.fillStyle = color
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
      drawContent()
    }

    return { highlightRegions, drawHeader, groupThemes }
  }, [strength, lastMove, indices, tinted, rowCount])
}
