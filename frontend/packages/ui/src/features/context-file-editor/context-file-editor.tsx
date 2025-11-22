import React from 'react'
import { Editor as Monaco } from '@monaco-editor/react'

interface ContextFileEditorProps {
  fileContent?: string
}

const ContextFileEditor: React.FC<ContextFileEditorProps> = ({
  fileContent,
}) => {
  return (
    <div>
      <Monaco
        width="100%"
        height="calc(100vh - 250px)"
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
        value={fileContent}
      />
    </div>
  )
}

export default ContextFileEditor
