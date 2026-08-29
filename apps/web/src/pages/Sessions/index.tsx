import { DeleteOutlined, EditOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import type { DebugSession, SessionStatus } from '@agent-mock/shared';
import { sessionApi } from '@/api/session';
import { SessionStatusTag } from '@/components/labels';
import { Page, PageHeader } from '@/components/Page';
import { useWorkbenchStore } from '@/stores/workbench';
import { useT } from '@/i18n';

const { Text } = Typography;

type StatusFilter = SessionStatus | 'all';

/** 会话归档页：给会话补名字、打标签、回放或清理。 */
export function SessionsPage() {
  const { projectId = '' } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const selectSession = useWorkbenchStore((state) => state.selectSession);

  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<DebugSession | null>(null);
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    status: SessionStatus;
    tags?: string[];
  }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await sessionApi.list(projectId, {
        limit: 300,
        ...(status === 'all' ? {} : { status }),
      });
      setSessions(page.items);
      setTotal(page.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openWorkbench = async (session: DebugSession) => {
    await selectSession(session.id);
    navigate(`/projects/${projectId}/workbench`);
  };

  const submit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    try {
      await sessionApi.update(editing.id, values);
      message.success(t('sessions.updated'));
      setEditing(null);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Page>
      <PageHeader
        title={t('sessions.title')}
        description={t('sessions.description', { total })}
        extra={
          <>
            <Segmented
              value={status}
              onChange={(value) => setStatus(value as StatusFilter)}
              options={[
                { label: t('sessions.filterAll'), value: 'all' },
                { label: t('sessionStatus.active'), value: 'active' },
                { label: t('sessionStatus.completed'), value: 'completed' },
                { label: t('sessionStatus.archived'), value: 'archived' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table<DebugSession>
          rowKey="id"
          loading={loading}
          dataSource={sessions}
          scroll={{ x: 1180 }}
          pagination={{ pageSize: 20, showSizeChanger: true, style: { paddingInline: 24 } }}
          columns={[
            {
              title: t('common.name'),
              dataIndex: 'name',
              minWidth: 240,
              render: (_, session) => (
                <Space orientation="vertical" size={4}>
                  <Button
                    variant="link"
                    style={{ padding: 0, height: 'auto', fontSize: 14 }}
                    onClick={() => void openWorkbench(session)}
                  >
                    {session.name}
                  </Button>
                  {session.description && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {session.description}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: t('common.status'),
              dataIndex: 'status',
              width: 150,
              render: (_, session) => (
                <Space size={8} wrap>
                  <SessionStatusTag status={session.status} />
                  {session.replaySourceId && (
                    <Tag color="cyan" style={{ marginInlineEnd: 0 }}>
                      {t('sessions.replay')}
                    </Tag>
                  )}
                </Space>
              ),
            },
            {
              title: t('sessions.colTags'),
              dataIndex: 'tags',
              width: 180,
              render: (_, session) =>
                session.tags.length === 0 ? (
                  <Text type="secondary">—</Text>
                ) : (
                  <Space size={8} wrap>
                    {session.tags.map((tag) => (
                      <Tag key={tag} variant="filled" style={{ marginInlineEnd: 0 }}>
                        {tag}
                      </Tag>
                    ))}
                  </Space>
                ),
            },
            {
              title: t('sessions.colInteractions'),
              dataIndex: 'interactionCount',
              width: 130,
              render: (_, session) => (
                <Space size={8} wrap>
                  <Text>{session.interactionCount}</Text>
                  {(session.waitingCount ?? 0) > 0 && (
                    <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                      {t('sessions.waitingSuffix', { count: session.waitingCount ?? 0 })}
                    </Tag>
                  )}
                </Space>
              ),
            },
            {
              title: 'Session ID',
              dataIndex: 'externalId',
              width: 240,
              render: (_, session) =>
                session.externalId ? (
                  <Text copyable className="mock-mono" style={{ fontSize: 13 }}>
                    {session.externalId}
                  </Text>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {t('sessions.autoSession')}
                  </Text>
                ),
            },
            {
              title: t('sessions.colStart'),
              dataIndex: 'startedAt',
              width: 180,
              render: (value: number) => (
                <Text style={{ fontSize: 13 }}>
                  {dayjs(value).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
              ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 190,
              fixed: 'right',
              render: (_, session) => (
                <Space size={12}>
                  <Tooltip title={t('sessions.replayTip')}>
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={async () => {
                        try {
                          const replay = await sessionApi.replay(session.id);
                          message.success(
                            t('sessions.replayCreated', {
                              externalId: String(replay.externalId ?? ''),
                            }),
                          );
                          await load();
                        } catch (error) {
                          message.error(error instanceof Error ? error.message : String(error));
                        }
                      }}
                    >
                      {t('sessions.replay')}
                    </Button>
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(session);
                        form.setFieldsValue({
                          name: session.name,
                          description: session.description,
                          status: session.status,
                          tags: session.tags,
                        });
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        modal.confirm({
                          title: t('sessions.deleteConfirm', { name: session.name }),
                          content: t('sessions.deleteContent'),
                          okText: t('common.delete'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: async () => {
                            await sessionApi.remove(session.id);
                            message.success(t('sessions.deleted'));
                            await load();
                          },
                        })
                      }
                    />
                  </Tooltip>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={editing !== null}
        title={t('sessions.modalEdit')}
        onCancel={() => setEditing(null)}
        onOk={() => void submit()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="name"
            label={t('common.name')}
            rules={[{ required: true, message: t('sessions.nameRequired') }]}
          >
            <Input placeholder={t('sessions.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} />
          </Form.Item>
          <Form.Item name="status" label={t('common.status')}>
            <Select
              options={[
                { value: 'active', label: t('sessionStatus.active') },
                { value: 'completed', label: t('sessionStatus.completed') },
                { value: 'archived', label: t('sessionStatus.archived') },
              ]}
            />
          </Form.Item>
          <Form.Item name="tags" label={t('sessions.colTags')} extra={t('sessions.tagsExtra')}>
            <Select mode="tags" placeholder={t('sessions.tagsPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
