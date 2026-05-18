import { useLayoutEffect, useRef } from 'react'
import { Editor as Monaco, type OnMount } from '@monaco-editor/react'

import { CenteredLoader } from '../../components/feedback'
import { useAppDispatch, useAppStore } from '../../redux/hooks'
import { setView } from './context-file.slice'

type MonacoEditor = Parameters<OnMount>[0]

interface ContextFileEditorProps {
  content?: string
}

const ContextFileEditor = ({ content }: ContextFileEditorProps) => {
  const dispatch = useAppDispatch()
  const store = useAppStore()
  const editorRef = useRef<MonacoEditor | null>(null)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    const savedView = store.getState().contextFile.view
    if (savedView) {
      editor.restoreViewState(savedView)
    }
  }

  // Save the view state in a layout-effect cleanup to avoid race with a parent
  // useEffect cleanup (e.g. resetContextFile on proposal change).
  useLayoutEffect(() => {
    return () => {
      const viewState = editorRef.current?.saveViewState()
      if (viewState) {
        dispatch(setView(viewState))
      }
    }
  }, [dispatch])

  return (
    <Monaco
      theme="vs-light"
      options={{
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        smoothScrolling: true,
        tabSize: 4,
        disableLayerHinting: true,
        readOnly: true,
      }}
      defaultLanguage="python"
      value={content}
      loading={<CenteredLoader />}
      onMount={handleMount}
    />
  )
}

export default ContextFileEditor
