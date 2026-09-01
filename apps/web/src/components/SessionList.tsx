import {
  CheckOutlined,
  ClearOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import {
  App,
  Badge,
  Button,
  Empty,
  Flex,
  Input,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useState } from 'react';
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
  onRename: (sessionId: string, name: string) => Promise<void>;
}

/** 左侧会话列表：一次 Agent 运行 = 一个 Session。 */
export function SessionList({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onReplay,
  onReset,
  onRename,
}: SessionListProps) {
  const t = useT();
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  const startRenaming = (session: DebugSession) => {
    setEditingId(session.id);
    setDraftName(session.name);
  };

  const cancelRenaming = () => {
    setEditingId(null);
    setDraftName('');
  };

  const saveName = async (session: DebugSession) => {
    const name = draftName.trim();
    if (!name) {
      message.warning(t('sessions.nameRequired'));
      return;
    }
    if (name === session.name) {
      cancelRenaming();
      return;
    }

    setSaving(true);
    try {
      await onRename(session.id, name);
      message.success(t('sessions.renamed'));
      cancelRenaming();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

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
            onClick={() => {
              if (editingId !== null) cancelRenaming();
              onSelect(session.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (editingId !== null) cancelRenaming();
                onSelect(session.id);
              }
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
              {editingId === session.id ? (
                <Flex
                  align="center"
                  gap={2}
                  style={{ flex: 1, minWidth: 0 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Input
                    autoFocus
                    size="small"
                    maxLength={200}
                    value={draftName}
                    disabled={saving}
                    style={{ minWidth: 0 }}
                    aria-label={t('sessions.renameInput')}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Escape') cancelRenaming();
                    }}
                    onPressEnter={() => void saveName(session)}
                  />
                  <Tooltip title={t('common.save')}>
                    <Button
                      type="text"
                      size="small"
                      loading={saving}
                      aria-label={t('common.save')}
                      icon={<CheckOutlined />}
                      onClick={() => void saveName(session)}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.cancel')}>
                    <Button
                      type="text"
                      size="small"
                      disabled={saving}
                      aria-label={t('common.cancel')}
                      icon={<CloseOutlined />}
                      onClick={cancelRenaming}
                    />
                  </Tooltip>
                </Flex>
              ) : (
                <Text ellipsis style={{ flex: 1 }} strong={active}>
                  {session.name}
                </Text>
              )}
              {editingId !== session.id && (session.waitingCount ?? 0) > 0 && (
                <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                  {session.waitingCount}
                </Tag>
              )}
              {editingId !== session.id && (
                <Space size={2}>
                  <Tooltip title={t('sessions.renameTip')}>
                    <Button
                      type="text"
                      size="small"
                      aria-label={t('sessions.renameAria')}
                      icon={<EditOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        startRenaming(session);
                      }}
                    />
                  </Tooltip>
                  {active && (
                    <>
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
                    </>
                  )}
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
