import { Editor as Monaco } from '@monaco-editor/react'

import { CenteredLoader } from '../../components/feedback'

interface ContextFileEditorProps {
  content?: string
}

const ContextFileEditor = ({ content }: ContextFileEditorProps) => {
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
    />
  )
}

export default ContextFileEditor
