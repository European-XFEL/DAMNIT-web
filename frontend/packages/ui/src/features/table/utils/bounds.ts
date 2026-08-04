import { type Rectangle } from '@glideapps/glide-data-grid'
import { type IBounds } from 'react-laag'

export const ZERO_BOUNDS: IBounds = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
}

export const toBounds = (rect: Rectangle): IBounds => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  right: rect.x + rect.width,
  bottom: rect.y + rect.height,
})
