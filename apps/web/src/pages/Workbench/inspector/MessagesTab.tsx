import { Empty, Listy, Space, Tag, Typography } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import type { ChatMessage } from '@agent-mock/shared';
import { JsonBlock } from '@/components/JsonBlock';

const { Text } = Typography;

const ROLE_COLOR: Record<string, string | undefined> = {
  assistant: 'blue',
  user: 'green',
};

interface MessageRow {
  index: number;
  message: ChatMessage;
}

/** 消息：把请求里的 messages 按角色渲染，文本内容走 Markdown。 */
export function MessagesTab({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请求里没有 messages" />;
  }

  // messages 没有稳定 id，用下标当 rowKey。
  const rows: MessageRow[] = messages.map((message, index) => ({ index, message }));

  return (
    <Listy<MessageRow>
      items={rows}
      rowKey="index"
      styles={{ item: { paddingBlock: 8 } }}
      itemRender={({ message }) => (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <Space size={8}>
            <Tag color={ROLE_COLOR[message.role]}>{message.role || 'unknown'}</Tag>
            {message.name ? <Text type="secondary">{message.name}</Text> : null}
            {message.tool_call_id ? (
              <Text type="secondary" className="mock-mono">
                tool_call_id: {message.tool_call_id}
              </Text>
            ) : null}
          </Space>
          <MessageContent content={message.content} />
          {message.tool_calls ? <JsonBlock value={message.tool_calls} maxHeight={220} /> : null}
          {message.reasoning_content ? (
            <Text type="secondary">{message.reasoning_content}</Text>
          ) : null}
        </Space>
      )}
    />
  );
}

/** content 可能是字符串（Markdown 渲染）也可能是多模态数组（按 JSON 展示）。 */
function MessageContent({ content }: { content: unknown }) {
  if (content === undefined || content === null) return null;
  if (typeof content === 'string') {
    return (
      <div className="mock-markdown">
        <ReactMarkdown remarkPlugins={[remarkBreaks]}>{content}</ReactMarkdown>
      </div>
    );
  }
  return <JsonBlock value={content} maxHeight={180} />;
}
