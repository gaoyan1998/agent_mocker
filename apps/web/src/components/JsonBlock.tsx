import { CopyOutlined } from '@ant-design/icons';
import { App, Button, Empty } from 'antd';
import { useMemo } from 'react';
import { MonacoEditor } from './MonacoEditor';
import { useT } from '../i18n';

interface JsonBlockProps {
  value: unknown;
  maxHeight?: number | string;
  emptyText?: string;
  copyable?: boolean;
}

/** 统一的 JSON 展示块：等宽字体 + 复制按钮 + 超长滚动。 */
export function JsonBlock({
  value,
  maxHeight = 360,
  emptyText,
  copyable = true,
}: JsonBlockProps) {
  const t = useT();
  const { message } = App.useApp();

  const text = useMemo(() => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  if (!text) {
    return (
      <div style={{ padding: '24px 0' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText ?? t('common.noData')} />
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('common.copied'));
    } catch {
      message.error(t('common.copyFailed'));
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {copyable && (
        <Button
          size="small"
          variant="text"
          icon={<CopyOutlined />}
          onClick={copy}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
        />
      )}
      <MonacoEditor
        value={text}
        readOnly
        height={maxHeight}
        language={typeof value === 'string' ? 'python' : 'json'}
      />
    </div>
  );
}
