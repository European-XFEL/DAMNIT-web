// Keep this import first: Monaco reads `globalAPI` as it loads, and only then
// sets `window.monaco`, which the e2e specs read.
import './environment'

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/editor/editor.all.js'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js'
import { loader } from '@monaco-editor/react'

loader.config({ monaco })

export { Editor } from '@monaco-editor/react'
