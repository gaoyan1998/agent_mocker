import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  describeAction,
  describeCondition,
  type MockAction,
  type MockTool,
  type Rule,
  type RuleCondition,
} from '@agent-mock/shared';
import { ruleApi, toolApi } from '@/api/config';
import { ActionEditor } from '@/components/editors/ActionEditor';
import { ConditionEditor } from '@/components/editors/ConditionEditor';
import { Page, PageHeader } from '@/components/Page';
import { useLang, useT } from '@/i18n';

const { Text } = Typography;

interface RuleFormValues {
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
}

const EMPTY_CONDITION: RuleCondition = { type: 'contains', value: '', target: 'last_user_message' };
const EMPTY_ACTION: MockAction = { type: 'assistant', content: '' };

/** 规则管理:WHEN（条件）+ THEN（动作）。 */
export function RulesPage() {
  const { projectId = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const { message, modal } = App.useApp();

  const [rules, setRules] = useState<Rule[]>([]);
  const [tools, setTools] = useState<MockTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [condition, setCondition] = useState<RuleCondition>(EMPTY_CONDITION);
  const [action, setAction] = useState<MockAction>(EMPTY_ACTION);
  const [conditionJson, setConditionJson] = useState(false);
  const [actionJson, setActionJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<RuleFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleItems, toolItems] = await Promise.all([
        ruleApi.list(projectId),
        toolApi.list(projectId),
      ]);
      setRules(ruleItems);
      setTools(toolItems);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (rule: Rule | null) => {
    setEditing(rule);
    setCondition(rule?.condition ?? EMPTY_CONDITION);
    setAction(rule?.action ?? EMPTY_ACTION);
    setConditionJson(false);
    setActionJson(false);
    form.setFieldsValue({
      name: rule?.name ?? '',
      description: rule?.description ?? '',
      priority: rule?.priority ?? 100,
      enabled: rule?.enabled ?? true,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = { ...values, condition, action };
      if (editing) await ruleApi.update(editing.id, payload);
      else await ruleApi.create(projectId, payload);
      message.success(editing ? t('rules.updated') : t('rules.created'));
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: Rule, enabled: boolean) => {
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, enabled } : item)),
    );
    try {
      await ruleApi.update(rule.id, { enabled });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      await load();
    }
  };

  return (
    <Page>
      <PageHeader
        title={t('rules.title')}
        description={t('rules.description')}
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
              {t('rules.new')}
            </Button>
          </>
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table<Rule>
          rowKey="id"
          loading={loading}
          dataSource={rules}
          pagination={false}
          scroll={{ x: 1080 }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('rules.empty')}
                />
              </div>
            ),
          }}
          columns={[
            {
              title: t('common.name'),
              dataIndex: 'name',
              width: 240,
              render: (_, rule) => (
                <Space orientation="vertical" size={4}>
                  <Text strong>{rule.name}</Text>
                  {rule.description && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {rule.description}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: t('rules.colCondition'),
              key: 'condition',
              width: 260,
              render: (_, rule) => (
                <Text style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {describeCondition(rule.condition, lang)}
                </Text>
              ),
            },
            {
              title: t('rules.colAction'),
              key: 'action',
              width: 260,
              render: (_, rule) => (
                <Text style={{ fontSize: 13, lineHeight: 1.7 }}>{describeAction(rule.action, lang)}</Text>
              ),
            },
            { title: t('common.priority'), dataIndex: 'priority', width: 100 },
            {
              title: t('rules.colHits'),
              dataIndex: 'matchCount',
              width: 90,
              render: (value: number) =>
                value > 0 ? (
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    {value}
                  </Tag>
                ) : (
                  <Text type="secondary">0</Text>
                ),
            },
            {
              title: t('common.enabled'),
              dataIndex: 'enabled',
              width: 90,
              render: (_, rule) => (
                <Switch checked={rule.enabled} onChange={(value) => void toggle(rule, value)} />
              ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 130,
              fixed: 'right',
              render: (_, rule) => (
                <Space size={12}>
                  <Tooltip title={t('common.edit')}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(rule)} />
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        modal.confirm({
                          title: t('rules.deleteConfirm', { name: rule.name }),
                          okText: t('common.delete'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: async () => {
                            await ruleApi.remove(rule.id);
                            message.success(t('rules.deleted'));
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
        defaultSize={800}
        resizable
        open={open}
        title={editing ? t('rules.modalEdit') : t('rules.modalNew')}
        onClose={() => setOpen(false)}
        destroyOnHidden
        footer={
          <Flex justify="flex-end" gap={12}>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
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
            label={t('rules.fieldName')}
            rules={[{ required: true, message: t('rules.fieldNameRequired') }]}
          >
            <Input placeholder={t('rules.fieldNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          <Flex gap={32} wrap>
            <Form.Item name="priority" label={t('rules.fieldPriority')}>
              <InputNumber  min={-999} max={999} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Flex>

          <Form.Item label={t('rules.when')}>
            <ConditionEditor
              value={condition}
              onChange={setCondition}
              jsonMode={conditionJson}
              onJsonModeChange={setConditionJson}
            />
          </Form.Item>

          <Form.Item label={t('rules.then')} style={{ marginBottom: 0 }}>
            <ActionEditor
              value={action}
              onChange={setAction}
              tools={tools}
              jsonMode={actionJson}
              onJsonModeChange={setActionJson}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </Page>
  );
}
