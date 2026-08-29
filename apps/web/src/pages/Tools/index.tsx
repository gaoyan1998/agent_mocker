import {
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TOOL_RESPONSE_MODES, type MockTool, type ToolResponseMode } from '@agent-mock/shared';
import { toolApi } from '../../api/config';
import { JsonBlock } from '../../components/JsonBlock';
import { MonacoEditor } from '../../components/MonacoEditor';
import { Page, PageHeader } from '../../components/Page';
import { useT } from '../../i18n';

const { Text } = Typography;

const MODE_LABEL_KEYS: Record<ToolResponseMode, string> = {
  static: 'tools.mode.static',
  template: 'tools.mode.template',
  random: 'tools.mode.random',
  sequence: 'tools.mode.sequence',
  error: 'tools.mode.error',
};

interface ToolFormValues {
  name: string;
  description?: string;
  parametersText: string;
  responseText: string;
  responsesText: string;
  errorMessage?: string;
  delayMs: number;
}

function parseJson(text: string, fallback: unknown): unknown {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/** Tool 管理。 */
export function ToolsPage() {
  const { projectId = '' } = useParams();
  const t = useT();
  const { message, modal } = App.useApp();

  const [tools, setTools] = useState<MockTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MockTool | null>(null);
  const [mode, setMode] = useState<ToolResponseMode>('static');
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ToolFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTools(await toolApi.list(projectId));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (tool: MockTool | null) => {
    setEditing(tool);
    setMode(tool?.responseMode ?? 'static');
    form.setFieldsValue({
      name: tool?.name ?? '',
      description: tool?.description ?? '',
      parametersText: JSON.stringify(
        tool?.parameters ?? {
          type: 'object',
          properties: { order_id: { type: 'string' } },
          required: ['order_id'],
        },
        null,
        2,
      ),
      responseText: JSON.stringify(tool?.response ?? { status: 'paid' }, null, 2),
      responsesText: JSON.stringify(tool?.responses ?? [], null, 2),
      errorMessage: tool?.errorMessage ?? '',
      delayMs: tool?.delayMs ?? 0,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        description: values.description ?? '',
        parameters: parseJson(values.parametersText, {}) as Record<string, unknown>,
        responseMode: mode,
        response: parseJson(values.responseText, null),
        responses: (parseJson(values.responsesText, []) as unknown[]) ?? [],
        errorMessage: values.errorMessage ?? '',
        delayMs: values.delayMs,
      };
      if (editing) await toolApi.update(editing.id, payload);
      else await toolApi.create(projectId, payload);
      message.success(editing ? t('tools.updated') : t('tools.created'));
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title={t('tools.title')}
        description={t('tools.description')}
        extra={
          <>
            <Button
              
              icon={<ReloadOutlined />}
              onClick={() => void load()}
              loading={loading}
            >
              {t('common.refresh')}
            </Button>
            <Button
              
              color="primary"
              variant="solid"
              icon={<PlusOutlined />}
              onClick={() => openEditor(null)}
            >
              {t('tools.new')}
            </Button>
          </>
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table<MockTool>
          rowKey="id"
          loading={loading}
          dataSource={tools}
          pagination={false}
          scroll={{ x: 960 }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tools.empty')} />
              </div>
            ),
          }}
          expandable={{
            expandedRowRender: (tool) => (
              <Flex gap={24} wrap style={{ padding: '8px 0' }}>
                <Space orientation="vertical" size={8} style={{ minWidth: 300, flex: 1 }}>
                  <Text type="secondary">Parameters</Text>
                  <JsonBlock value={tool.parameters} maxHeight={200} />
                </Space>
                <Space orientation="vertical" size={8} style={{ minWidth: 300, flex: 1 }}>
                  <Text type="secondary">
                    {tool.responseMode === 'random' || tool.responseMode === 'sequence'
                      ? 'Responses'
                      : 'Response'}
                  </Text>
                  <JsonBlock
                    value={
                      tool.responseMode === 'random' || tool.responseMode === 'sequence'
                        ? tool.responses
                        : tool.responseMode === 'error'
                          ? { error: tool.errorMessage }
                          : tool.response
                    }
                    maxHeight={200}
                  />
                </Space>
              </Flex>
            ),
          }}
          columns={[
            {
              title: t('common.name'),
              dataIndex: 'name',
              width: 260,
              render: (_, tool) => (
                <Space orientation="vertical" size={4}>
                  <Text strong className="mock-mono">
                    {tool.name}
                  </Text>
                  {tool.description && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {tool.description}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: t('tools.colMode'),
              dataIndex: 'responseMode',
              width: 130,
              render: (value: ToolResponseMode) => (
                <Tag style={{ marginInlineEnd: 0 }}>{t(MODE_LABEL_KEYS[value])}</Tag>
              ),
            },
            {
              title: t('tools.colDelay'),
              dataIndex: 'delayMs',
              width: 110,
              render: (value: number) =>
                value > 0 ? `${value} ms` : <Text type="secondary">—</Text>,
            },
            {
              title: t('tools.colCursor'),
              dataIndex: 'cursor',
              width: 120,
              render: (value: number, tool) =>
                tool.responseMode === 'sequence' ? (
                  `${value % Math.max(1, tool.responses.length)}`
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 230,
              fixed: 'right',
              render: (_, tool) => (
                <Space size={12}>
                  <Tooltip title={t('tools.previewTip')}>
                    <Button
                      size="small"
                      icon={<ExperimentOutlined />}
                      onClick={async () => {
                        try {
                          const result = await toolApi.preview(tool.id, { order_id: '123456' });
                          modal.info({
                            title: t('tools.previewTitle', { name: tool.name }),
                            width: 600,
                            content: (
                              <div style={{ marginTop: 16 }}>
                                <JsonBlock value={result.result} />
                              </div>
                            ),
                          });
                          await load();
                        } catch (error) {
                          message.error(error instanceof Error ? error.message : String(error));
                        }
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('tools.resetCursorTip')}>
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      onClick={async () => {
                        await toolApi.resetCursor(tool.id);
                        message.success(t('tools.cursorReset'));
                        await load();
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(tool)} />
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        modal.confirm({
                          title: t('tools.deleteConfirm', { name: tool.name }),
                          okText: t('common.delete'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: async () => {
                            await toolApi.remove(tool.id);
                            message.success(t('tools.deleted'));
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

      <Drawer
        open={open}
        title={editing ? t('tools.modalEdit', { name: editing.name }) : t('tools.modalNew')}
        
        onClose={() => setOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: '24px 28px' } }}
        footer={
          <Flex justify="flex-end" gap={12}>
            <Button  onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              
              color="primary"
              variant="solid"
              loading={saving}
              onClick={() => void submit()}
            >
              {t('common.save')}
            </Button>
          </Flex>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('tools.fieldName')}
            rules={[
              { required: true, message: t('tools.fieldNameRequired') },
              { pattern: /^[a-zA-Z0-9_.-]+$/, message: t('tools.fieldNamePattern') },
            ]}
          >
            <Input  placeholder="get_order" className="mock-mono" />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input placeholder={t('tools.fieldDescPlaceholder')} />
          </Form.Item>
          <Form.Item name="parametersText" label="Parameters（JSON Schema）">
            <MonacoEditor language="json" height={240} />
          </Form.Item>

          <Form.Item label={t('tools.fieldMode')}>
            <Segmented
              
              value={mode}
              onChange={(value) => setMode(value as ToolResponseMode)}
              options={TOOL_RESPONSE_MODES.map((item) => ({
                label: t(MODE_LABEL_KEYS[item]),
                value: item,
              }))}
            />
          </Form.Item>

          {mode === 'template' && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
              title={t('tools.templateTitle')}
              description={t('tools.templateDesc')}
            />
          )}

          {(mode === 'static' || mode === 'template') && (
            <Form.Item name="responseText" label="Response（JSON）">
              <MonacoEditor language="json" height={260} />
            </Form.Item>
          )}

          {(mode === 'random' || mode === 'sequence') && (
            <Form.Item
              name="responsesText"
              label={t('tools.responsesLabel')}
              extra={
                mode === 'random'
                  ? t('tools.responsesRandomExtra')
                  : t('tools.responsesSequenceExtra')
              }
            >
              <MonacoEditor language="json" height={300} />
            </Form.Item>
          )}

          {mode === 'error' && (
            <Form.Item name="errorMessage" label={t('tools.errorMessage')}>
              <Input  placeholder="database connection failed" />
            </Form.Item>
          )}

          <Form.Item name="delayMs" label={t('tools.delayLabel')} style={{ marginBottom: 0 }}>
            <InputNumber  min={0} max={600_000} step={100} style={{ width: 220 }} />
          </Form.Item>
        </Form>
      </Drawer>
    </Page>
  );
}
