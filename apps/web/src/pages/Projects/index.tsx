import { DeleteOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Project } from '@agent-mock/shared';
import { Page, PageHeader } from '../../components/Page';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { useProjectStore } from '../../stores/project';
import { useT } from '../../i18n';

const { Text, Paragraph } = Typography;

interface ProjectFormValues {
  name: string;
  description?: string;
  apiKey?: string;
}

/** 项目列表：系统首页。 */
export function ProjectsPage() {
  const t = useT();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const projects = useProjectStore((state) => state.projects);
  const loading = useProjectStore((state) => state.loading);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const createProject = useProjectStore((state) => state.createProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const removeProject = useProjectStore((state) => state.removeProject);

  const [editing, setEditing] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ProjectFormValues>();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ name: '', description: '', apiKey: '' });
    setOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    form.setFieldsValue({
      name: project.name,
      description: project.description,
      apiKey: project.apiKey,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updateProject(editing.id, values);
        message.success(t('projects.updated'));
      } else {
        const project = await createProject(values);
        message.success(t('projects.created'));
        navigate(`/projects/${project.id}/workbench`);
      }
      setOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (project: Project) => {
    modal.confirm({
      title: t('projects.deleteConfirm', { name: project.name }),
      content: t('projects.deleteContent'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await removeProject(project.id);
        message.success(t('projects.deleted'));
      },
    });
  };

  return (
    <Page gap={28}>
      <PageHeader
        title={t('projects.title')}
        description={t('projects.description')}
        extra={
          <>
            <LanguageSwitch />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void loadProjects()}
              loading={loading}
            >
              {t('common.refresh')}
            </Button>
            <Button
              color="primary"
              variant="solid"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              {t('projects.new')}
            </Button>
          </>
        }
      />

      {loading && projects.length === 0 ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : projects.length === 0 ? (
        <Card>
          <div style={{ padding: '40px 0' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space orientation="vertical" size={8}>
                  <Text style={{ fontSize: 15 }}>{t('projects.empty')}</Text>
                  <Text type="secondary">{t('projects.emptyHint')}</Text>
                </Space>
              }
            >
              <Button
                color="primary"
                variant="solid"
                icon={<PlusOutlined />}
                onClick={openCreate}
                style={{ marginTop: 8 }}
              >
                {t('projects.new')}
              </Button>
            </Empty>
          </div>
        </Card>
      ) : (
        <Flex wrap gap={24}>
          {projects.map((project) => (
            <Card
              key={project.id}
              style={{ width: 400 }}
              title={
                <Flex align="center" gap={10}>
                  <span>{project.name}</span>
                  {(project.waitingCount ?? 0) > 0 && (
                    <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                      {t('projects.waitingCount', { count: project.waitingCount ?? 0 })}
                    </Tag>
                  )}
                </Flex>
              }
              extra={
                <Space size={8}>
                  <Tooltip title={t('projects.editTip')}>
                    <Button
                      variant="text"
                      icon={<SettingOutlined />}
                      onClick={() => openEdit(project)}
                    />
                  </Tooltip>
                  <Tooltip title={t('projects.deleteTip')}>
                    <Button
                      variant="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => confirmDelete(project)}
                    />
                  </Tooltip>
                </Space>
              }
              actions={[
                <Button
                  key="open"
                  variant="text"
                  onClick={() => navigate(`/projects/${project.id}/workbench`)}
                >
                  {t('projects.openWorkbench')}
                </Button>,
                <Button
                  key="rules"
                  variant="text"
                  onClick={() => navigate(`/projects/${project.id}/rules`)}
                >
                  {t('projects.openRules')}
                </Button>,
              ]}
            >
              <Space orientation="vertical" size={20} style={{ width: '100%' }}>
                <Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  style={{ minHeight: 48, margin: 0 }}
                >
                  {project.description || t('projects.noDescription')}
                </Paragraph>

                <Flex gap={40}>
                  <Statistic
                    title={t('projects.statSessions')}
                    value={project.sessionCount ?? 0}
                    valueStyle={{ fontSize: 22 }}
                  />
                  <Statistic
                    title={t('projects.statInteractions')}
                    value={project.interactionCount ?? 0}
                    valueStyle={{ fontSize: 22 }}
                  />
                </Flex>

                <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                  <Text type="secondary">API Key</Text>
                  <Text
                    copyable={{ text: project.apiKey }}
                    className="mock-mono"
                    style={{ fontSize: 13 }}
                  >
                    {project.apiKey}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {t('projects.updatedAt', {
                      time: dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm'),
                    })}
                  </Text>
                </Space>
              </Space>
            </Card>
          ))}
        </Flex>
      )}

      <Modal
        open={open}
        title={editing ? t('projects.modalEdit') : t('projects.modalNew')}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={saving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="name"
            label={t('projects.fieldName')}
            rules={[{ required: true, message: t('projects.fieldNameRequired') }]}
          >
            <Input placeholder={t('projects.fieldNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea
              placeholder={t('projects.fieldDescPlaceholder')}
              autoSize={{ minRows: 3, maxRows: 5 }}
            />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            extra={t('projects.apiKeyExtra')}
            rules={[{ min: 8, message: t('projects.apiKeyMin') }]}
          >
            <Input placeholder={t('projects.apiKeyPlaceholder')} className="mock-mono" />
          </Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
