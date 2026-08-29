import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { theme as antdTheme } from 'antd';
import { useUiStore } from '../stores/ui';
import { useT } from '../i18n';

// 使用随应用打包的 Monaco，避免编辑器首次打开时依赖外部 CDN。
loader.config({ monaco });

/** 全局 Monaco 主题：颜色集中维护，所有编辑器实例共享。 */
monaco.editor.defineTheme('mock-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1f2937',
    'editorLineNumber.foreground': '#9ca3af',
    'editorLineNumber.activeForeground': '#4b5563',
    'editor.lineHighlightBackground': '#f5f7fa',
    'editor.selectionBackground': '#dbeafe',
    'editor.inactiveSelectionBackground': '#eff6ff',
    'editorIndentGuide.background1': '#eef0f3',
    'editorIndentGuide.activeBackground1': '#d1d5db',
  },
});

monaco.editor.defineTheme('mock-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#141414',
    'editor.foreground': '#e5e7eb',
    'editorLineNumber.foreground': '#6b7280',
    'editorLineNumber.activeForeground': '#d1d5db',
    'editor.lineHighlightBackground': '#1f2937',
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#1e3a5f',
    'editorIndentGuide.background1': '#30363d',
    'editorIndentGuide.activeBackground1': '#4b5563',
  },
});

/** 全局默认 options：需要单个实例特殊处理时，再由组件 options 覆盖。 */
const MONACO_OPTIONS = {
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  padding: { top: 12, bottom: 12 },
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
};

interface MonacoEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  language?: 'json' | 'markdown' | 'plaintext' | 'typescript' | 'javascript' | 'python';
  height?: number | string;
  readOnly?: boolean;
  placeholder?: string;
}

/** 统一的代码/JSON 编辑器，受控用法可直接嵌入 antd Form 或工作台动作面板。 */
export function MonacoEditor({
  value,
  onChange,
  language = 'json',
  height = 220,
  readOnly = false,
  placeholder,
}: MonacoEditorProps) {
  const { token } = antdTheme.useToken();
  const t = useT();
  const mode = useUiStore((state) => state.theme);

  return (
    <div
      style={{
        overflow: 'hidden',
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        background: mode === 'dark' ? '#141414' : '#ffffff',
      }}
    >
      <Editor
        height={height}
        language={language}
        theme={'vs-dark'}
        // theme={mode === 'dark' ? 'mock-dark' : 'mock-light'}
        value={value ?? ''}
        onChange={(next) => onChange?.(next ?? '')}
        loading={t('common.loadingEditor')}
        options={{
          readOnly,
          ...MONACO_OPTIONS,
          lineNumbers: readOnly ? 'off' : 'on',
          folding: !readOnly,
          renderLineHighlight: readOnly ? 'none' : 'line',
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          suggest: { showMethods: !readOnly, showFunctions: !readOnly },
          ...(placeholder ? { ariaLabel: placeholder } : {}),
        }}
      />
    </div>
  );
}
