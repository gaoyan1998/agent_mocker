import { Badge, Space, Tag, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import type { Interaction, InteractionStatus } from '@agent-mock/shared';
import { ModeTag, StatusTag } from '@/components/labels';
import { EventRow } from './EventRow';

const { Text } = Typography;

const BADGE_STATUS: Record<InteractionStatus, 'processing' | 'success' | 'error' | 'default'> = {
  pending: 'default',
  waiting: 'processing',
  completed: 'success',
  error: 'error',
  timeout: 'error',
  aborted: 'default',
};

interface InteractionCardProps {
  interaction: Interaction;
  /** 选中的是整条交互（而不是它内部的某个事件）。 */
  selected: boolean;
  selectedEventId: string | null;
  onSelect: (eventId: string | null) => void;
}

/** 时间线上的一次请求：标题行 + 内部事件的缩进列表。 */
export function InteractionCard({
  interaction,
  selected,
  selectedEventId,
  onSelect,
}: InteractionCardProps) {
  const { token } = theme.useToken();
  const events = interaction.events ?? [];

  return (
    <div style={{ width: '100%' }}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          border: `1px solid ${selected ? token.colorPrimary : token.colorBorderSecondary}`,
          background: selected ? token.controlItemBgActive : token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Badge status={BADGE_STATUS[interaction.status]} />
        <Text strong style={{ fontSize: 15 }}>
          请求 #{interaction.sequence}
        </Text>
        <Text type="secondary">{dayjs(interaction.createdAt).format('HH:mm:ss')}</Text>
        <Space size={8}>
          <StatusTag status={interaction.status} />
          <ModeTag mode={interaction.mode} />
          {interaction.stream && <Tag color="blue">stream</Tag>}
        </Space>
        <span style={{ marginLeft: 'auto' }}>
          <Text type="secondary">
            {interaction.model}
            {interaction.latencyMs !== null ? ` · ${interaction.latencyMs}ms` : ''}
          </Text>
        </span>
      </button>

      {events.length > 0 && (
        <div
          style={{
            marginLeft: 14,
            borderLeft: `1px dashed ${token.colorBorder}`,
            paddingLeft: 5,
            marginTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              selected={selectedEventId === event.id}
              onSelect={() => onSelect(event.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
