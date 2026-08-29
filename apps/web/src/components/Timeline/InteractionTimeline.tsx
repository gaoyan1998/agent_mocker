import { Badge, Empty, Skeleton, Space, Tag, theme, Typography } from 'antd';
import dayjs from 'dayjs';
import type { Interaction, InteractionEvent } from '@agent-mock/shared';
import { EVENT_META, ModeTag, StatusTag } from '../labels';
import { useT, type TFunction } from '../../i18n';

const { Text } = Typography;

interface TimelineProps {
  interactions: Interaction[];
  selection: { interactionId: string | null; eventId: string | null };
  onSelect: (interactionId: string, eventId: string | null) => void;
  loading?: boolean;
}

/**
 * Timeline：一次 Session 里的所有 Interaction 以及每个
 * Interaction 内部的过程事件（request → think → tool_call → … → assistant）。
 */
export function InteractionTimeline({
  interactions,
  selection,
  onSelect,
  loading,
}: TimelineProps) {
  const t = useT();
  const { token } = theme.useToken();

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} style={{ padding: 24 }} />;

  if (interactions.length === 0) {
    return (
      <div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space orientation="vertical" size={8}>
              <Text style={{ fontSize: 15 }}>{t('timeline.empty')}</Text>
              <Text type="secondary">{t('timeline.emptyHint')}</Text>
            </Space>
          }
        />
      </div>
    );
  }

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%', padding: '10px 14px' }}>
      {interactions.map((interaction) => {
        const interactionSelected =
          selection.interactionId === interaction.id && selection.eventId === null;
        const events = interaction.events ?? [];
        return (
          <div key={interaction.id} style={{ width: '100%' }}>
            <button
              type="button"
              onClick={() => onSelect(interaction.id, null)}
              style={{
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                border: `1px solid ${interactionSelected ? token.colorPrimary : token.colorBorderSecondary}`,
                background: interactionSelected ? token.controlItemBgActive : token.colorBgContainer,
                borderRadius: token.borderRadiusLG,
                padding: '7px 10px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <Badge
                status={
                  interaction.status === 'waiting'
                    ? 'processing'
                    : interaction.status === 'completed'
                      ? 'success'
                      : interaction.status === 'error' || interaction.status === 'timeout'
                        ? 'error'
                        : 'default'
                }
              />
              <Text strong style={{ fontSize: 15 }}>
                {t('timeline.requestNo', { seq: interaction.sequence })}
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
                {events.map((event) => {
                  const meta = EVENT_META[event.type];
                  const selected = selection.eventId === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelect(interaction.id, event.id)}
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
                      <Tag
                        color={meta.color}
                        style={{ marginInlineEnd: 0, minWidth: 118, textAlign: 'center' }}
                      >
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
                        {summarizeEvent(event, t)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Space>
  );
}

export function summarizeEvent(event: InteractionEvent, t: TFunction): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'request': {
      const count = payload.messageCount ?? 0;
      const tools = Array.isArray(payload.tools) ? payload.tools : [];
      const preview = previewMessages(payload.newMessages);
      return `${t('timeline.messageCount', { count: Number(count) })}${
        tools.length > 0 ? ` · ${t('timeline.toolCount', { count: tools.length })}` : ''
      }${preview ? ` · ${preview}` : ''}`;
    }
    case 'decision':
      return String(payload.reason ?? payload.mode ?? '');
    case 'think':
      return clip(String(payload.content ?? ''));
    case 'tool_call': {
      const calls = Array.isArray(payload.toolCalls) ? payload.toolCalls : [];
      return calls
        .map((call) => {
          const item = call as { name?: string; arguments?: string };
          return `${item.name ?? '?'}(${clip(item.arguments ?? '', 48)})`;
        })
        .join(', ');
    }
    case 'tool_result':
      return `${String(payload.tool ?? '')} → ${clip(stringify(payload.result), 64)}${
        payload.source === 'agent' ? t('timeline.fromAgent') : ''
      }`;
    case 'assistant':
      return clip(String(payload.content ?? ''));
    case 'delay':
      return t('timeline.waitMs', { ms: String(payload.ms ?? 0) });
    case 'error':
      return `${String(payload.status ?? '')} ${String(payload.message ?? '')}`;
    default:
      return '';
  }
}

function previewMessages(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const last = value[value.length - 1] as { role?: string; content?: unknown };
  const content = typeof last.content === 'string' ? last.content : stringify(last.content);
  return `${last.role ?? '?'}: ${clip(content, 60)}`;
}

function stringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clip(text: string, max = 80): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length <= max ? single : `${single.slice(0, max)}…`;
}
