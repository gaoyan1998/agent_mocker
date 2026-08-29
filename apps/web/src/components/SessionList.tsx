import { DeleteOutlined, PlayCircleOutlined, ClearOutlined } from '@ant-design/icons';
import { App, Badge, Button, Empty, Flex, Space, Tag, Tooltip, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import type { DebugSession } from '@agent-mock/shared';
import { useT } from '../i18n';

const { Text } = Typography;

interface SessionListProps {
  sessions: DebugSession[];
  activeId: string | null;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onReplay: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
}

/** 左侧会话列表：一次 Agent 运行 = 一个 Session。 */
export function SessionList({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onReplay,
  onReset,
}: SessionListProps) {
  const t = useT();
  const { token } = theme.useToken();
  const { modal } = App.useApp();

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '48px 24px' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sessions.empty')} />
      </div>
    );
  }

  return (
    <Space orientation="vertical" size={10} style={{ width: '100%', padding: 16 }}>
      {sessions.map((session) => {
        const active = session.id === activeId;
        return (
          <div
            key={session.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(session.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSelect(session.id);
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
                  <Tooltip title={t('sessions.replayTip')}>
                    <Button
                      type="text"
                      size="small"
                      aria-label={t('sessions.replayAria')}
                      icon={<PlayCircleOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onReplay(session.id);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('sessions.resetTip')}>
                    <Button
                      type="text"
                      size="small"
                      aria-label={t('sessions.resetAria')}
                      icon={<ClearOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        modal.confirm({
                          title: t('sessions.resetConfirm', { name: session.name }),
                          content: t('sessions.resetContent'),
                          okText: t('sessions.resetOk'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: () => onReset(session.id),
                        });
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('sessions.deleteTip')}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      aria-label={t('sessions.deleteAria')}
                      icon={<DeleteOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        modal.confirm({
                          title: t('sessions.deleteConfirm', { name: session.name }),
                          content: t('sessions.deleteContent'),
                          okText: t('common.delete'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: () => onDelete(session.id),
                        });
                      }}
                    />
                  </Tooltip>
                </Space>
              )}
            </Flex>

            <Flex align="center" gap={8} wrap style={{ marginTop: 10 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t('sessions.interactionCount', { count: session.interactionCount })}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                ·
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {dayjs(session.lastActivityAt).format('MM-DD HH:mm')}
              </Text>
              {session.replaySourceId && (
                <Tag color="cyan" style={{ marginInlineEnd: 0 }}>
                  {t('sessions.replay')}
                </Tag>
              )}
              {session.auto && !session.replaySourceId && (
                <Tag style={{ marginInlineEnd: 0 }}>{t('sessions.autoTag')}</Tag>
              )}
            </Flex>

          </div>
        );
      })}
    </Space>
  );
}
