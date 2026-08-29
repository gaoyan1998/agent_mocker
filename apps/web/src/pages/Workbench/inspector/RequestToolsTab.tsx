import { Empty, Listy, Space, Tag, Typography } from 'antd';
import type { ChatTool } from '@agent-mock/shared';
import { JsonBlock } from '@/components/JsonBlock';

const { Text } = Typography;

interface ToolRow {
  index: number;
  tool: ChatTool;
}

/** Tools：Agent 在请求里声明的可用工具。 */
export function RequestToolsTab({ tools }: { tools: ChatTool[] }) {
  if (tools.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请求里没有 tools" />;
  }

  // tools 没有稳定 id，用下标当 rowKey。
  const rows: ToolRow[] = tools.map((tool, index) => ({ index, tool }));

  return (
    <Listy<ToolRow>
      items={rows}
      rowKey="index"
      styles={{ item: { paddingBlock: 8 } }}
      itemRender={({ tool }) => (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <Space size={8}>
            <Tag color="purple">{tool.type || 'function'}</Tag>
            <Text strong className="mock-mono">
              {tool.function?.name || '未命名工具'}
            </Text>
          </Space>
          {tool.function?.description ? (
            <Text type="secondary">{tool.function.description}</Text>
          ) : null}
          {tool.function?.parameters !== undefined ? (
            <JsonBlock value={tool.function.parameters} maxHeight={220} />
          ) : null}
        </Space>
      )}
    />
  );
}
