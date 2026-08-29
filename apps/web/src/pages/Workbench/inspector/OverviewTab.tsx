import { Descriptions, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { Interaction } from '@agent-mock/shared';
import { ModeTag, StatusTag } from '@/components/labels';

const { Text } = Typography;

/** 概览：一次交互的关键元数据。 */
export function OverviewTab({ interaction }: { interaction: Interaction }) {
  const { response, error } = interaction;

  return (
    <Descriptions
      column={1}
      styles={{ label: { width: 116 } }}
      items={[
        { key: 'id', label: 'ID', children: <Text code>{interaction.id}</Text> },
        { key: 'seq', label: '序号', children: `#${interaction.sequence}` },
        {
          key: 'status',
          label: '状态',
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
          label: '开始时间',
          children: dayjs(interaction.createdAt).format('YYYY-MM-DD HH:mm:ss.SSS'),
        },
        {
          key: 'latency',
          label: '耗时',
          children: interaction.latencyMs === null ? '—' : `${interaction.latencyMs} ms`,
        },
        {
          key: 'usage',
          label: 'Token（估算）',
          children: response
            ? `${response.usage.prompt_tokens} + ${response.usage.completion_tokens} = ${response.usage.total_tokens}`
            : '—',
        },
        ...(error
          ? [
              {
                key: 'error',
                label: '错误',
                children: (
                  <Text type="danger">
                    {error.status} {error.message}
                  </Text>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
