// Import styles required by installed packages
import '@mantine/core/styles.layer.css'
import 'mantine-contextmenu/styles.layer.css'
import 'mantine-datatable/styles.layer.css'

import '@glideapps/glide-data-grid/dist/index.css'

import '@fontsource-variable/source-sans-3'
import '@fontsource-variable/source-sans-3/wght-italic.css'
import '@fontsource-variable/source-code-pro'

import { FONT_NAME_MONO, FONT_NAME_SANS } from '#src/styles/fonts'

// Glide clears its cached text widths once, when the fonts first settle, so
// start both downloads before it loads rather than on the grid's first draw.
for (const family of [FONT_NAME_SANS, FONT_NAME_MONO]) {
  document.fonts.load(`1em '${family}'`).catch((error: unknown) => {
    console.warn(`Font ${family} did not load`, error)
  })
}
