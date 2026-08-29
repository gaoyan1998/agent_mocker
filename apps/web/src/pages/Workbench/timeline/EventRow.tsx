import { Space, Tag, theme } from 'antd';
import dayjs from 'dayjs';
import type { InteractionEvent } from '@agent-mock/shared';
import { EVENT_META } from '@/components/labels';
import { summarizeEvent } from './summarizeEvent';

interface EventRowProps {
  event: InteractionEvent;
  selected: boolean;
  onSelect: () => void;
}

/** 交互内部的一个过程事件（request / think / tool_call / …）。 */
export function EventRow({ event, selected, onSelect }: EventRowProps) {
  const { token } = theme.useToken();
  const meta = EVENT_META[event.type];

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        border: `1px solid ${selected ? token.colorPrimaryBorder : 'transparent'}`,
        background: selected ? token.controlItemBgActive : 'transparent',
        borderRadius: token.borderRadius,
        padding: '4px 6px',
      }}
    >
      <span
        style={{ color: token.colorTextTertiary, fontSize: 13, minWidth: 64 }}
        className="mock-mono"
      >
        {dayjs(event.createdAt).format('HH:mm:ss')}
      </span>
      <Tag color={meta.color} style={{ marginInlineEnd: 0, minWidth: 118, textAlign: 'center' }}>
        <Space size={6}>
          {meta.icon}
          {meta.label}
        </Space>
      </Tag>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: 1.7,
          color: token.colorTextSecondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {summarizeEvent(event)}
      </span>
    </button>
  );
}
