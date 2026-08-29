import { Empty, Skeleton, Space, Typography } from 'antd';
import { useWorkbenchStore } from '@/stores/workbench';
import { InteractionCard } from './InteractionCard';

const { Text } = Typography;

/**
 * Timeline：一次 Session 里的所有 Interaction 以及每个
 * Interaction 内部的过程事件（request → think → tool_call → … → assistant）。
 */
export function TimelinePanel() {
  const interactions = useWorkbenchStore((state) => state.interactions);
  const selection = useWorkbenchStore((state) => state.selection);
  const loading = useWorkbenchStore((state) => state.loadingInteractions);
  const select = useWorkbenchStore((state) => state.select);

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} style={{ padding: 24 }} />;

  if (interactions.length === 0) {
    return (
      <div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space orientation="vertical" size={8}>
              <Text style={{ fontSize: 15 }}>还没有收到任何请求</Text>
              <Text type="secondary">把 Agent 的 base_url 指向 /v1 并发起一次调用即可</Text>
            </Space>
          }
        />
      </div>
    );
  }

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%', padding: '10px 14px' }}>
      {interactions.map((interaction) => (
        <InteractionCard
          key={interaction.id}
          interaction={interaction}
          selected={selection.interactionId === interaction.id && selection.eventId === null}
          selectedEventId={selection.eventId}
          onSelect={(eventId) => select(interaction.id, eventId)}
        />
      ))}
    </Space>
  );
}
