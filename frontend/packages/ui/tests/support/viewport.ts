import { onTestFinished } from 'vitest'
import { page } from 'vitest/browser'

// Resizes for the current test only; the next one starts at Vitest's 414 x 896.
export async function resizeViewport({
  width,
  height,
}: {
  width: number
  height: number
}) {
  await page.viewport(width, height)
  onTestFinished(() => page.viewport(414, 896))
}
