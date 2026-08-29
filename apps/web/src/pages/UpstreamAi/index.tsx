import {ApiOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, ApiTwoTone} from '@ant-design/icons';
import {Alert, App, Button, Card, Flex, Form, Input, Select, Skeleton, Space, Switch, Typography} from 'antd';
import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import type {UpstreamConfig} from '@agent-mock/shared';
import {Page, PageHeader} from '@/components/Page';
import {useProjectStore} from '@/stores/project';
import {upstreamApi} from '../../api/config';
import {useT} from '@/i18n';

const {Paragraph, Text} = Typography;

interface UpstreamFormValues {
    upstreams: UpstreamConfig[]
}

function newUpstream(): UpstreamConfig {
    return {
        id: crypto.randomUUID(),
        name: 'OpenAI',
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: ''
    };
}

export function UpstreamAiPage() {
    const {projectId = ''} = useParams();
    const t = useT();
    const {message} = App.useApp();
    const project = useProjectStore((state) => state.current);
    const loadProject = useProjectStore((state) => state.loadProject);
    const updateProject = useProjectStore((state) => state.updateProject);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<Record<string, boolean>>({});
    const [modelOptions, setModelOptions] = useState<Record<string, Array<{value: string; label: string}>>>({});
    const [form] = Form.useForm<UpstreamFormValues>();
    const upstreamValues = Form.useWatch('upstreams', form) ?? [];
    useEffect(() => {
        if (!project || project.id !== projectId) {
            void loadProject(projectId);
            return;
        }
        const upstreams = project.settings.upstreams.length > 0 ? project.settings.upstreams : project.settings.upstreamEnabled && project.settings.upstreamBaseUrl ? [{
            id: crypto.randomUUID(),
            name: t('upstream.defaultName'),
            enabled: true,
            baseUrl: project.settings.upstreamBaseUrl,
            apiKey: project.settings.upstreamApiKey,
            model: project.settings.upstreamModel
        }] : [];
        form.setFieldsValue({upstreams});
    }, [form, loadProject, project, projectId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            upstreamValues.forEach((item, index) => {
                if (!item?.baseUrl || !item.apiKey) return;
                void upstreamApi.models({baseUrl: item.baseUrl, apiKey: item.apiKey})
                    .then(({models}) => setModelOptions((current) => ({
                        ...current,
                        [item.id || String(index)]: models.map((model) => ({value: model.id, label: model.name ? `${model.id} · ${model.name}` : model.id})),
                    })))
                    .catch(() => undefined);
            });
        }, 450);
        return () => window.clearTimeout(timer);
    }, [upstreamValues]);
    if (!project || project.id !== projectId) return <Skeleton active style={{padding: 32}} paragraph={{rows: 7}}/>;

    const submit = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            await updateProject(projectId, {settings: {upstreams: values.upstreams ?? []}});
            message.success(t('upstreamAi.saved'));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    return <Page gap={24}>
        <PageHeader title={t('upstreamAi.title')} description={t('upstreamAi.description')}
                    extra={
                        <Space>
                            <Paragraph style={{margin: 0}}>
                                {t('upstreamAi.hint', {
                                    content: 'content',
                                    reasoning: 'reasoning_content',
                                    toolCalls: 'tool_calls',
                                })}
                            </Paragraph>
                            <Button
                                color="primary"
                                variant="solid"
                                icon={<SaveOutlined/>}
                                loading={saving}
                                onClick={() => void submit()}>{t('upstreamAi.saveConfig')}</Button>
                        </Space>
                    }/>
        <Form form={form} layout="vertical" requiredMark="optional" style={{width: '100%'}}>
            <Form.List
                name="upstreams">{(fields, {add, remove}) =>
                <Space
                    orientation="vertical" size={16}
                    style={{width: '100%'}}>
                    {fields.map((field, index) =>
                        <Card
                            size="small"
                            key={field.key} style={{width: '100%'}}
                            title={<Space><ApiOutlined/>{t('upstreamAi.cardTitle', {index: index + 1})}</Space>}
                            extra={<Space size={8}>
                                <Button
                                    icon={<ApiTwoTone/>}
                                    loading={testing[field.key]}
                                    onClick={() => {
                                        const item = form.getFieldValue(['upstreams', field.name]) as UpstreamConfig | undefined;
                                        if (!item?.baseUrl || !item.apiKey) {
                                            message.warning(t('upstreamAi.needBaseUrlAndKey'));
                                            return;
                                        }
                                        setTesting((current) => ({...current, [field.key]: true}));
                                        void upstreamApi.models({baseUrl: item.baseUrl, apiKey: item.apiKey})
                                            .then(({models}) => {
                                                setModelOptions((current) => ({...current, [item.id || String(index)]: models.map((model) => ({value: model.id, label: model.name ? `${model.id} · ${model.name}` : model.id}))}));
                                                message.success(t('upstreamAi.testOk', {count: models.length}));
                                            })
                                            .catch((error) => message.error(error instanceof Error ? error.message : String(error)))
                                            .finally(() => setTesting((current) => ({...current, [field.key]: false})));
                                    }}
                                >{t('upstreamAi.testConnection')}</Button>
                                <Button danger variant="text" icon={<DeleteOutlined/>} onClick={() => remove(field.name)}>{t('common.delete')}</Button>
                            </Space>
                            }>
                            <Form.Item name={[field.name, 'id']} hidden>
                                <Input/>
                            </Form.Item>
                            <Flex gap={20} wrap>
                                <Form.Item
                                    name={[field.name, 'name']} label={t('common.name')}
                                    rules={[{required: true, message: t('upstreamAi.nameRequired')}]}
                                    style={{flex: 1, minWidth: 260}}>
                                    <Input placeholder={t('upstreamAi.namePlaceholder')}/>
                                </Form.Item>
                                <Form.Item
                                    style={{flex: 1, minWidth: 260}}
                                    name={[field.name, 'baseUrl']} label="Base URL"
                                    rules={[{required: true, message: t('upstreamAi.baseUrlRequired')}, {
                                        type: 'url',
                                        message: t('upstreamAi.baseUrlInvalid')
                                    }]} extra={t('upstreamAi.baseUrlExtra')}>
                                    <Input placeholder="https://api.openai.com/v1"/>
                                </Form.Item>

                                <Form.Item
                                    name={[field.name, 'apiKey']} label="API Key"
                                    style={{flex: 1, minWidth: 300}}>
                                    <Input.Password
                                        autoComplete="new-password"
                                        placeholder={t('upstreamAi.apiKeyPlaceholder')}/>
                                </Form.Item>
                                <Form.Item
                                    name={[field.name, 'model']} label={t('upstreamAi.defaultModel')} style={{flex: 1, minWidth: 300}}
                                    extra={t('upstreamAi.defaultModelExtra')}><Select
                                    showSearch allowClear optionFilterProp="label" placeholder={t('upstreamAi.modelPlaceholder')}
                                    options={modelOptions[(form.getFieldValue(['upstreams', field.name, 'id']) as string) || String(index)] ?? []}
                                    onSearch={(value) => {
                                        if (value && !(modelOptions[(form.getFieldValue(['upstreams', field.name, 'id']) as string) || String(index)] ?? []).some((item) => item.value === value)) {
                                            setModelOptions((current) => ({...current, [(form.getFieldValue(['upstreams', field.name, 'id']) as string) || String(index)]: [...(current[(form.getFieldValue(['upstreams', field.name, 'id']) as string) || String(index)] ?? []), {value, label: value}]}));
                                        }
                                    }} />
                                </Form.Item>
                                <Form.Item
                                    name={[field.name, 'enabled']} label={t('common.status')} valuePropName="checked"
                                    style={{width: 120}}>
                                    <Switch checkedChildren={t('upstreamAi.on')} unCheckedChildren={t('upstreamAi.off')}/>
                                </Form.Item>
                            </Flex>

                        </Card>
                    )}
                    <Button block variant="dashed" icon={<PlusOutlined/>} onClick={() => add(newUpstream())}>{t('upstreamAi.add')}</Button>
                </Space>}</Form.List>
        </Form>

    </Page>;
}
