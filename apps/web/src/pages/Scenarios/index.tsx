import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
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
  type RuleCondition,
  type Scenario,
  type ScenarioStepInput,
} from '@agent-mock/shared';
import { scenarioApi, toolApi } from '@/api/config';
import { ActionEditor } from '@/components/editors/ActionEditor';
import { ConditionEditor } from '@/components/editors/ConditionEditor';
import { Page, PageHeader, SectionTitle } from '@/components/Page';
import { useLang, useT } from '@/i18n';

const { Text } = Typography;

interface ScenarioFormValues {
  name: string;
  description?: string;
  enabled: boolean;
  loop: boolean;
}

const DEFAULT_STEP: ScenarioStepInput = {
  name: '',
  condition: null,
  action: { type: 'assistant', content: '' },
};

/** 场景管理：按步骤推进的多轮 Agent 流程。 */
export function ScenariosPage() {
  const { projectId = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const { message, modal } = App.useApp();

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [tools, setTools] = useState<MockTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [trigger, setTrigger] = useState<RuleCondition>({ type: 'always' });
  const [triggerJson, setTriggerJson] = useState(false);
  const [steps, setSteps] = useState<ScenarioStepInput[]>([DEFAULT_STEP]);
  /** 每个步骤的条件/动作是否处于 JSON 模式，key 形如 "0:condition"。 */
  const [stepJson, setStepJson] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ScenarioFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scenarioItems, toolItems] = await Promise.all([
        scenarioApi.list(projectId),
        toolApi.list(projectId),
      ]);
      setScenarios(scenarioItems);
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

  const openEditor = (scenario: Scenario | null) => {
    setEditing(scenario);
    setTrigger(scenario?.trigger ?? { type: 'always' });
    setTriggerJson(false);
    setSteps(
      scenario && scenario.steps.length > 0
        ? scenario.steps.map((step) => ({
            id: step.id,
            name: step.name,
            condition: step.condition,
            action: step.action,
          }))
        : [DEFAULT_STEP],
    );
    form.setFieldsValue({
      name: scenario?.name ?? '',
      description: scenario?.description ?? '',
      enabled: scenario?.enabled ?? true,
      loop: scenario?.loop ?? false,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...values,
        trigger: trigger.type === 'always' ? null : trigger,
        steps,
      };
      if (editing) await scenarioApi.update(editing.id, payload);
      else await scenarioApi.create(projectId, payload);
      message.success(editing ? t('scenarios.updated') : t('scenarios.created'));
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const updateStep = (index: number, patch: Partial<ScenarioStepInput>) =>
    setSteps((current) =>
      current.map((step, position) => (position === index ? { ...step, ...patch } : step)),
    );

  const moveStep = (index: number, delta: number) =>
    setSteps((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });

  return (
    <Page>
      <PageHeader
        title={t('scenarios.title')}
        description={t('scenarios.description')}
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
              {t('scenarios.new')}
            </Button>
          </>
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table<Scenario>
          rowKey="id"
          loading={loading}
          dataSource={scenarios}
          pagination={false}
          scroll={{ x: 1040 }}
          expandable={{
            expandedRowRender: (scenario) => (
              <Space orientation="vertical" size={12} style={{ width: '100%', padding: '8px 0' }}>
                {scenario.steps.map((step) => (
                  <Flex key={step.id} gap={12} align="center" wrap>
                    <Tag style={{ marginInlineEnd: 0 }}>{t('scenarios.stepN', { n: step.sequence })}</Tag>
                    <Text>{step.name || t('common.unnamed')}</Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {describeCondition(step.condition, lang)} → {describeAction(step.action, lang)}
                    </Text>
                  </Flex>
                ))}
              </Space>
            ),
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('scenarios.empty')} />
              </div>
            ),
          }}
          columns={[
            {
              title: t('common.name'),
              dataIndex: 'name',
              width: 260,
              render: (_, scenario) => (
                <Space orientation="vertical" size={4}>
                  <Text strong>{scenario.name}</Text>
                  {scenario.description && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {scenario.description}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: t('scenarios.colTrigger'),
              key: 'trigger',
              width: 280,
              render: (_, scenario) => (
                <Text style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {describeCondition(scenario.trigger, lang)}
                </Text>
              ),
            },
            { title: t('scenarios.colSteps'), width: 90, render: (_, scenario) => scenario.steps.length },
            {
              title: t('scenarios.colLoop'),
              width: 100,
              render: (_, scenario) =>
                scenario.loop ? (
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    {t('scenarios.loop')}
                  </Tag>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            {
              title: t('common.enabled'),
              width: 90,
              render: (_, scenario) => (
                <Switch
                  checked={scenario.enabled}
                  onChange={async (enabled) => {
                    try {
                      await scenarioApi.update(scenario.id, { enabled });
                      await load();
                    } catch (error) {
                      message.error(error instanceof Error ? error.message : String(error));
                    }
                  }}
                />
              ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 180,
              fixed: 'right',
              render: (_, scenario) => (
                <Space size={12}>
                  <Tooltip title={t('scenarios.resetTip')}>
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      onClick={async () => {
                        await scenarioApi.reset(scenario.id);
                        message.success(t('scenarios.resetDone'));
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditor(scenario)}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        modal.confirm({
                          title: t('scenarios.deleteConfirm', { name: scenario.name }),
                          okText: t('common.delete'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: async () => {
                            await scenarioApi.remove(scenario.id);
                            message.success(t('scenarios.deleted'));
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
        title={editing ? t('scenarios.modalEdit') : t('scenarios.modalNew')}
        defaultSize={800}
        resizable
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
            label={t('scenarios.fieldName')}
            rules={[{ required: true, message: t('scenarios.fieldNameRequired') }]}
          >
            <Input placeholder={t('scenarios.fieldNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          <Flex gap={40} wrap>
            <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="loop" label={t('scenarios.fieldLoop')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Flex>

          <Form.Item label={t('scenarios.enterCondition')} style={{ marginBottom: 0 }}>
            <ConditionEditor
              value={trigger}
              onChange={setTrigger}
              jsonMode={triggerJson}
              onJsonModeChange={setTriggerJson}
            />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 32 }}>
          <SectionTitle>{t('scenarios.steps')}</SectionTitle>
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            {steps.map((step, index) => (
              <Card
                key={step.id ?? index}
                title={t('scenarios.stepN', { n: index + 1 })}
                extra={
                  <Space size={8}>
                    <Tooltip title={t('scenarios.moveUp')}>
                      <Button
                        variant="text"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      />
                    </Tooltip>
                    <Tooltip title={t('scenarios.moveDown')}>
                      <Button
                        variant="text"
                        icon={<ArrowDownOutlined />}
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      />
                    </Tooltip>
                    <Tooltip title={t('common.deleteThisStep')}>
                      <Button
                        variant="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={steps.length === 1}
                        onClick={() => setSteps((current) => current.filter((_, p) => p !== index))}
                      />
                    </Tooltip>
                  </Space>
                }
              >
                <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                  <Input
                    value={step.name}
                    placeholder={t('scenarios.stepNamePlaceholder')}
                    onChange={(event) => updateStep(index, { name: event.target.value })}
                  />
                  <Space size={10}>
                    <Switch
                      checked={step.condition === null || step.condition === undefined}
                      onChange={(checked) =>
                        updateStep(index, {
                          condition: checked ? null : { type: 'contains', value: '' },
                        })
                      }
                    />
                    <Text>{t('scenarios.anyRequestAdvances')}</Text>
                  </Space>
                  {step.condition != null && (
                    <ConditionEditor
                      value={step.condition}
                      onChange={(condition) => updateStep(index, { condition })}
                      jsonMode={stepJson[`${index}:condition`] ?? false}
                      onJsonModeChange={(value) =>
                        setStepJson((current) => ({ ...current, [`${index}:condition`]: value }))
                      }
                    />
                  )}
                  <ActionEditor
                    value={step.action as MockAction}
                    onChange={(action) => updateStep(index, { action })}
                    tools={tools}
                    jsonMode={stepJson[`${index}:action`] ?? false}
                    onJsonModeChange={(value) =>
                      setStepJson((current) => ({ ...current, [`${index}:action`]: value }))
                    }
                  />
                </Space>
              </Card>
            ))}
            <Button
              
              block
              variant="dashed"
              icon={<PlusOutlined />}
              onClick={() => setSteps((current) => [...current, { ...DEFAULT_STEP }])}
            >
              {t('common.addStep')}
            </Button>
          </Space>
        </div>
      </Drawer>
    </Page>
  );
}
