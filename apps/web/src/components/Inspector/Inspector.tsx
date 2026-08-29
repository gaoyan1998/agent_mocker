import { Descriptions, Empty, Flex, List, Space, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import type { Interaction, InteractionEvent } from '@agent-mock/shared';
import { JsonBlock } from '../JsonBlock';
import { EVENT_META, ModeTag, StatusTag } from '../labels';
import { useT } from '../../i18n';

const { Text } = Typography;

interface InspectorProps {
  interaction: Interaction | null;
  event: InteractionEvent | null;
}

/** Inspector：右侧详情面板，展示 Headers / Body / Response / 元数据。 */
export function Inspector({ interaction, event }: InspectorProps) {
  const t = useT();
  if (!interaction) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('inspector.pickInteraction')}
        style={{ marginTop: 80 }}
      />
    );
  }

  if (event) {
    const meta = EVENT_META[event.type];
    return (
      <Tabs style={{ padding: '4px 24px 24px' }} items={[{ key: 'event', label: t('inspector.eventDetail'), children: <div style={{ paddingTop: 16 }}>
        <Flex align="center" gap={12} wrap style={{ marginBottom: 16 }}>
          <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
            {meta.label}
          </Tag>
          <Text type="secondary">
            #{event.sequence} · {dayjs(event.createdAt).format('YYYY-MM-DD HH:mm:ss.SSS')}
          </Text>
        </Flex>
        <JsonBlock value={event.payload} maxHeight="calc(100vh - 360px)" />
      </div> }]} />
    );
  }

  const request = interaction.request as Record<string, unknown>;
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const tools = Array.isArray(request.tools) ? request.tools : [];

  return (
    <Tabs
      style={{ padding: '4px 24px 24px' }}
      items={[
        {
          key: 'overview',
          label: t('inspector.overview'),
          children: (
            <Descriptions
              column={1}
              styles={{ label: { width: 116 } }}
              items={[
                { key: 'id', label: 'ID', children: <Text code>{interaction.id}</Text> },
                { key: 'seq', label: t('inspector.seq'), children: `#${interaction.sequence}` },
                {
                  key: 'status',
                  label: t('common.status'),
                  children: (
                    <Space size={8} wrap>
                      <StatusTag status={interaction.status} />
                      <ModeTag mode={interaction.mode} />
                      {interaction.stream && <Tag color="blue">stream</Tag>}
                    </Space>
                  ),
                },
                { key: 'model', label: 'Model', children: interaction.model },
                {
                  key: 'created',
                  label: t('inspector.startedAt'),
                  children: dayjs(interaction.createdAt).format('YYYY-MM-DD HH:mm:ss.SSS'),
                },
                {
                  key: 'latency',
                  label: t('common.duration'),
                  children: interaction.latencyMs === null ? '—' : `${interaction.latencyMs} ms`,
                },
                {
                  key: 'usage',
                  label: t('inspector.tokens'),
                  children: interaction.response
                    ? `${interaction.response.usage.prompt_tokens} + ${interaction.response.usage.completion_tokens} = ${interaction.response.usage.total_tokens}`
                    : '—',
                },
                ...(interaction.error
                  ? [
                      {
                        key: 'error',
                        label: t('inspector.error'),
                        children: (
                          <Text type="danger">
                            {interaction.error.status} {interaction.error.message}
                          </Text>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          ),
        },
        {
          key: 'request',
          label: t('inspector.request'),
          children: (
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">Headers</Text>
              <JsonBlock value={interaction.requestHeaders} maxHeight={180} />
              <Text type="secondary" style={{ marginTop: 12 }}>
                Body
              </Text>
              <JsonBlock value={request} maxHeight="calc(100vh - 520px)" />
            </Space>
          ),
        },
        {
          key: 'messages',
          label: t('inspector.messages'),
          children: (
            messages.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('inspector.noMessages')} />
            ) : (
              <List
                size="small"
                dataSource={messages}
                renderItem={(message, index) => {
                  const item = (message ?? {}) as Record<string, unknown>;
                  return (
                    <List.Item key={index}>
                      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                        <Space size={8}>
                          <Tag color={item.role === 'assistant' ? 'blue' : item.role === 'user' ? 'green' : undefined}>
                            {String(item.role ?? 'unknown')}
                          </Tag>
                          {item.name ? <Text type="secondary">{String(item.name)}</Text> : null}
                          {item.tool_call_id ? <Text type="secondary" className="mock-mono">tool_call_id: {String(item.tool_call_id)}</Text> : null}
                        </Space>
                        {item.content !== undefined && item.content !== null ? (
                          typeof item.content === 'string' ? (
                            <div className="mock-markdown">
                              <ReactMarkdown remarkPlugins={[remarkBreaks]}>
                                {item.content}
                              </ReactMarkdown>
                            </div>
                          ) : <JsonBlock value={item.content} maxHeight={180} />
                        ) : null}
                        {item.tool_calls ? <JsonBlock value={item.tool_calls} maxHeight={220} /> : null}
                        {item.reasoning_content ? <Text type="secondary">{String(item.reasoning_content)}</Text> : null}
                      </Space>
                    </List.Item>
                  );
                }}
              />
            )
          ),
        },
        {
          key: 'tools',
          label: 'Tools',
          children:
            tools.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('inspector.noTools')} />
            ) : (
              <List
                size="small"
                dataSource={tools}
                renderItem={(tool, index) => {
                  const item = (tool ?? {}) as Record<string, unknown>;
                  const fn = (item.function ?? {}) as Record<string, unknown>;
                  return (
                    <List.Item key={index}>
                      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                        <Space size={8}>
                          <Tag color="purple">{String(item.type ?? 'function')}</Tag>
                          <Text strong className="mock-mono">{String(fn.name ?? t('inspector.unnamedTool'))}</Text>
                        </Space>
                        {fn.description ? <Text type="secondary">{String(fn.description)}</Text> : null}
                        {fn.parameters !== undefined ? <JsonBlock value={fn.parameters} maxHeight={220} /> : null}
                      </Space>
                    </List.Item>
                  );
                }}
              />
            ),
        },
        {
          key: 'response',
          label: t('inspector.response'),
          children: (
            <JsonBlock
              value={interaction.response ?? interaction.error}
              maxHeight="calc(100vh - 340px)"
              emptyText={
                interaction.status === 'waiting'
                  ? t('inspector.waitingManual')
                  : t('inspector.noResponse')
              }
            />
          ),
        },
        {
          key: 'raw',
          label: t('inspector.raw'),
          children: <JsonBlock value={interaction} maxHeight="calc(100vh - 340px)" />,
        },
      ]}
    />
  );
}
