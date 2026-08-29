import { ClearOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Badge, Button, Flex, Space, Tag, Tooltip, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import type { DebugSession } from '@agent-mock/shared';

const { Text } = Typography;

interface SessionCardProps {
  session: DebugSession;
  active: boolean;
  onSelect: () => void;
  onReplay: () => void;
  onReset: () => void;
  onDelete: () => void;
}

/** 会话列表里的一张卡片；只有选中的那张会露出操作按钮。 */
export function SessionCard({
  session,
  active,
  onSelect,
  onReplay,
  onReset,
  onDelete,
}: SessionCardProps) {
  const { token } = theme.useToken();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect();
      }}
      style={{
        cursor: 'pointer',
        padding: '14px 16px',
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${active ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
        background: active ? token.controlItemBgActive : token.colorBgContainer,
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      <Flex align="center" gap={10}>
        <Badge status={session.status === 'active' ? 'processing' : 'default'} />
        <Text ellipsis style={{ flex: 1 }} strong={active}>
          {session.name}
        </Text>
        {(session.waitingCount ?? 0) > 0 && (
          <Tag color="gold" style={{ marginInlineEnd: 0 }}>
            {session.waitingCount}
          </Tag>
        )}
        {active && (
          <Space size={2}>
            <Tooltip title="以这个会话的记录创建回放会话">
              <Button
                type="text"
                size="small"
                aria-label="回放会话"
                icon={<PlayCircleOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onReplay();
                }}
              />
            </Tooltip>
            <Tooltip title="清空当前记录，从头开始">
              <Button
                type="text"
                size="small"
                aria-label="重置会话记录"
                icon={<ClearOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onReset();
                }}
              />
            </Tooltip>
            <Tooltip title="删除会话">
              <Button
                type="text"
                size="small"
                danger
                aria-label="删除会话"
                icon={<DeleteOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              />
            </Tooltip>
          </Space>
        )}
      </Flex>

      <Flex align="center" gap={8} wrap style={{ marginTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {session.interactionCount} 次交互
        </Text>
        <Text type="secondary" style={{ fontSize: 13 }}>
          ·
        </Text>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {dayjs(session.lastActivityAt).format('MM-DD HH:mm')}
        </Text>
        {session.replaySourceId && (
          <Tag color="cyan" style={{ marginInlineEnd: 0 }}>
            回放
          </Tag>
        )}
        {session.auto && !session.replaySourceId && <Tag style={{ marginInlineEnd: 0 }}>自动</Tag>}
      </Flex>
    </div>
  );
}
