import { Empty, Tabs } from 'antd';
import { JsonBlock } from '@/components/JsonBlock';
import { useSelectedEvent, useSelectedInteraction } from '@/stores/workbench';
import { EventDetail } from './EventDetail';
import { MessagesTab } from './MessagesTab';
import { OverviewTab } from './OverviewTab';
import { RequestTab } from './RequestTab';
import { RequestToolsTab } from './RequestToolsTab';

const PANEL_STYLE = { padding: '4px 24px 24px' };

/** Inspector：右侧详情面板，展示 Headers / Body / Response / 元数据。 */
export function InspectorPanel() {
  const interaction = useSelectedInteraction();
  const event = useSelectedEvent();

  if (!interaction) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="选择一条交互查看详情"
        style={{ marginTop: 80 }}
      />
    );
  }

  // 选中了某个过程事件时，只看这个事件的 payload。
  if (event) {
    return (
      <Tabs
        style={PANEL_STYLE}
        items={[{ key: 'event', label: '事件详情', children: <EventDetail event={event} /> }]}
      />
    );
  }

  return (
    <Tabs
      style={PANEL_STYLE}
      items={[
        {
          key: 'overview',
          label: '概览',
          children: <OverviewTab interaction={interaction} />,
        },
        {
          key: 'request',
          label: '请求',
          children: <RequestTab interaction={interaction} />,
        },
        {
          key: 'messages',
          label: '消息',
          children: <MessagesTab messages={interaction.request.messages ?? []} />,
        },
        {
          key: 'tools',
          label: 'Tools',
          children: <RequestToolsTab tools={interaction.request.tools ?? []} />,
        },
        {
          key: 'response',
          label: '响应',
          children: (
            <JsonBlock
              value={interaction.response ?? interaction.error}
              maxHeight="calc(100vh - 340px)"
              emptyText={
                interaction.status === 'waiting' ? '正在等待人工回复…' : '还没有产生响应'
              }
            />
          ),
        },
        {
          key: 'raw',
          label: '原始',
          children: <JsonBlock value={interaction} maxHeight="calc(100vh - 340px)" />,
        },
      ]}
    />
  );
}
