import { DeleteOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_BEHAVIORS,
  THINK_MODES,
  type DefaultBehavior,
  type ProjectSettings,
  type ThinkMode,
} from '@agent-mock/shared';
import { systemApi, type SystemInfo } from '@/api/config';
import { ConnectSnippets } from '@/components/ConnectSnippets';
import { Page, PageHeader } from '@/components/Page';
import { useProjectStore } from '@/stores/project';
import { useT } from '@/i18n';

const { Text, Paragraph } = Typography;

const BEHAVIOR_LABEL_KEYS: Record<DefaultBehavior, string> = {
  manual: 'projectSettings.fallback.manual',
  echo: 'projectSettings.fallback.echo',
  fixed: 'projectSettings.fallback.fixed',
  error: 'projectSettings.fallback.error',
};

const THINK_LABEL_KEYS: Record<ThinkMode, string> = {
  reasoning_content: 'projectSettings.think.reasoning_content',
  content_tag: 'projectSettings.think.content_tag',
  both: 'projectSettings.think.both',
};

interface FormValues extends ProjectSettings {
  name: string;
  description: string;
}

/** 项目设置：兜底行为、延迟、流式参数、Session 复用窗口 + 接入示例。 */
export function ProjectSettingsPage() {
  const { projectId = '' } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const project = useProjectStore((state) => state.current);
  const loadProject = useProjectStore((state) => state.loadProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const removeProject = useProjectStore((state) => state.removeProject);
  const rotateKey = useProjectStore((state) => state.rotateKey);

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    void systemApi
      .info()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    if (!project || project.id !== projectId) {
      void loadProject(projectId);
      return;
    }
    form.setFieldsValue({
      name: project.name,
      description: project.description,
      ...project.settings,
    });
  }, [project, projectId, form, loadProject]);

  if (!project) return <Skeleton active style={{ padding: 32 }} paragraph={{ rows: 8 }} />;

  const submit = async () => {
    const values = await form.validateFields();
    const { name, description, ...settings } = values;
    setSaving(true);
    try {
      await updateProject(projectId, { name, description, settings });
      message.success(t('projectSettings.saved'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const mockBaseUrl = info?.mockBaseUrl ?? `${window.location.origin}/v1`;

  return (
    <Page>
      <PageHeader
        title={t('projectSettings.title')}
        description={t('projectSettings.description')}
        extra={
          <Button
            
            color="primary"
            variant="solid"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => void submit()}
          >
            {t('common.save')}
          </Button>
        }
      />

      <Flex gap={24} align="flex-start" wrap>
        <Space orientation="vertical" size={24} style={{ flex: 2, minWidth: 480 }}>
          <Card title={t('projectSettings.basic')}>
            <Form form={form} layout="vertical">
              <Form.Item
                name="name"
                label={t('projects.fieldName')}
                rules={[{ required: true, message: t('sessions.nameRequired') }]}
              >
                <Input  />
              </Form.Item>
              <Form.Item name="description" label={t('common.description')}>
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>

              <Form.Item label="API Key">
                <Flex gap={12} wrap>
                  <Input
                    
                    value={project.apiKey}
                    readOnly
                    className="mock-mono"
                    style={{ flex: 1, minWidth: 240 }}
                  />
                  <Button
                    
                    icon={<ReloadOutlined />}
                    onClick={() =>
                      modal.confirm({
                        title: t('projectSettings.regenerateConfirm'),
                        content: t('projectSettings.regenerateContent'),
                        okText: t('projectSettings.regenerate'),
                        cancelText: t('common.cancel'),
                        onOk: async () => {
                          await rotateKey(projectId);
                          message.success(t('projectSettings.apiKeyUpdated'));
                        },
                      })
                    }
                  >
                    {t('projectSettings.regenerate')}
                  </Button>
                </Flex>
              </Form.Item>

              <Form.Item
                name="defaultBehavior"
                label={t('projectSettings.fallbackLabel')}
                extra={t('projectSettings.fallbackExtra')}
              >
                <Segmented
                  
                  options={DEFAULT_BEHAVIORS.map((value) => ({
                    label: t(BEHAVIOR_LABEL_KEYS[value]),
                    value,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="fixedReply"
                label={t('projectSettings.fixedContentLabel')}
              >
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} />
              </Form.Item>

              <Flex gap={24} wrap>
                <Form.Item
                  name="manualTimeoutMs"
                  label={t('projectSettings.manualTimeout')}
                  extra={t('projectSettings.manualTimeoutExtra')}
                >
                  <InputNumber
                    
                    min={1000}
                    max={3_600_000}
                    step={1000}
                    style={{ width: 200 }}
                  />
                </Form.Item>
                <Form.Item name="responseDelayMs" label={t('projectSettings.responseDelay')}>
                  <InputNumber
                    
                    min={0}
                    max={600_000}
                    step={100}
                    style={{ width: 200 }}
                  />
                </Form.Item>
                <Form.Item name="defaultModel" label={t('projectSettings.defaultModel')}>
                  <Input  style={{ width: 200 }} />
                </Form.Item>
              </Flex>

              <Flex gap={24} wrap>
                <Form.Item name="streamChunkIntervalMs" label={t('projectSettings.streamInterval')}>
                  <InputNumber  min={0} max={10_000} step={10} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item name="streamChunkSize" label={t('projectSettings.streamChunkSize')}>
                  <InputNumber  min={1} max={2000} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item
                  name="autoSessionIdleMs"
                  label={t('projectSettings.autoSessionIdle')}
                  extra={t('projectSettings.autoSessionIdleExtra')}
                >
                  <InputNumber
                    
                    min={0}
                    max={86_400_000}
                    step={60_000}
                    style={{ width: 220 }}
                  />
                </Form.Item>
              </Flex>

              <Form.Item name="thinkMode" label={t('projectSettings.thinkModeLabel')} style={{ marginBottom: 0 }}>
                <Select
                  
                  style={{ width: 360 }}
                  options={THINK_MODES.map((value) => ({ label: t(THINK_LABEL_KEYS[value]), value }))}
                />
              </Form.Item>
            </Form>
          </Card>

          <Card title={t('projectSettings.danger')}>
            <Space orientation="vertical" size={20} style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                {t('projectSettings.dangerHint')}
              </Paragraph>
              <Button
                
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: t('projectSettings.deleteConfirm', { name: project.name }),
                    content: t('projectSettings.deleteContent'),
                    okText: t('common.delete'),
                    okButtonProps: { danger: true },
                    cancelText: t('common.cancel'),
                    onOk: async () => {
                      await removeProject(projectId);
                      message.success(t('projects.deleted'));
                      navigate('/projects');
                    },
                  })
                }
              >
                {t('projectSettings.deleteProject')}
              </Button>
            </Space>
          </Card>
        </Space>
      </Flex>
    </Page>
  );
}
