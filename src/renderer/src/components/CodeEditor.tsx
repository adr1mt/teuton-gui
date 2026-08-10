import Editor from '@monaco-editor/react'
import { useApp } from '../stores/app'
import '../monaco-setup'

export default function CodeEditor({
  value,
  language,
  onChange,
  readOnly
}: {
  value: string
  language: 'ruby' | 'yaml'
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  const theme = useApp((s) => s.theme)
  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      onChange={(v) => onChange?.(v ?? '')}
      options={{
        readOnly,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 14, bottom: 14 },
        lineNumbersMinChars: 3,
        renderLineHighlight: 'all',
        tabSize: 2,
        automaticLayout: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
      }}
    />
  )
}
