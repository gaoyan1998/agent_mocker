import { Flex, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { InteractionEvent } from '@agent-mock/shared';
import { JsonBlock } from '@/components/JsonBlock';
import { EVENT_META } from '@/components/labels';

const { Text } = Typography;

/** 选中某个过程事件时的详情：事件类型 + 时间 + 原始 payload。 */
export function EventDetail({ event }: { event: InteractionEvent }) {
  const meta = EVENT_META[event.type];

  return (
    <div style={{ paddingTop: 16 }}>
      <Flex align="center" gap={12} wrap style={{ marginBottom: 16 }}>
        <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
          {meta.label}
        </Tag>
        <Text type="secondary">
          #{event.sequence} · {dayjs(event.createdAt).format('YYYY-MM-DD HH:mm:ss.SSS')}
        </Text>
      </Flex>
      <JsonBlock value={event.payload} maxHeight="calc(100vh - 360px)" />
    </div>
  );
}
