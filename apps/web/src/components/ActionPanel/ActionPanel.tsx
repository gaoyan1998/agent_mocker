import {CloudSyncOutlined, SendOutlined, ThunderboltOutlined, CloudServerOutlined} from '@ant-design/icons';
import {
    Alert,
    App,
    AutoComplete,
    Button,
    Divider,
    Flex,
    Input,
    InputNumber,
    Segmented,
    Select,
    Space,
    Switch,
    Tabs,
    Tag,
    Typography,
} from 'antd';
import {useEffect, useState} from 'react';
import {
    ERROR_PRESETS,
    FINISH_REASONS,
    type FinishReason,
    type DebugSession,
    type Interaction,
    type MockTool,
    type UpstreamConfig,
} from '@agent-mock/shared';
import {interactionApi} from '../../api/interaction';
import {sessionApi} from '../../api/session';
import {toolApi, upstreamApi} from '../../api/config';
import {formatJsonSchemaExample} from '../../utils/jsonSchemaExample';
import {MonacoEditor} from '../MonacoEditor';
import {useT} from '../../i18n';

const {Text} = Typography;

interface ActionPanelProps {
    interaction: Interaction | null;
    session: DebugSession | null;
    tools: MockTool[];
    upstreams: UpstreamConfig[];
    onApplied: () => void;
    onSessionUpdated: (session: DebugSession) => void;
}

/** Tab 内容统一的纵向节奏：输入区 → 分隔线 → 操作行。 */
function TabBody({children}: { children: React.ReactNode }) {
    return (
        <Space orientation="vertical" size={16} style={{width: '100%'}}>
            {children}
        </Space>
    );
}

/** 操作行：左边是按钮组，右边是说明文字，按钮之间固定留 12px。 */
function ActionBar({children, hint}: { children: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <>
            <Flex align="center" justify="space-between" gap={16} wrap>
                <Space size={12} wrap>
                    {children}
                </Space>
                {hint && (
                    <Text type="secondary" style={{maxWidth: 460}}>
                        {hint}
                    </Text>
                )}
            </Flex>
        </>
    );
}

/**
 * Action Panel：Interaction 处于 waiting 时的人工控制台。
 * Think 不会结束请求，可以连续发多条；Reply / Tool Call / Error / Timeout 会结束请求。
 */
export function ActionPanel({interaction, session, tools, upstreams, onApplied, onSessionUpdated}: ActionPanelProps) {
    const t = useT();
    const {message} = App.useApp();
    const [tab, setTab] = useState('reply');
    const [replyMode, setReplyMode] = useState('manual');
    const [sending, setSending] = useState(false);

    const [reply, setReply] = useState('');
    const [finishReason, setFinishReason] = useState<FinishReason>('stop');
    const [replyDelay, setReplyDelay] = useState<number>(0);
    const [upstreamModel, setUpstreamModel] = useState('');
    const [upstreamId, setUpstreamId] = useState('');
    const [upstreamModelOptions, setUpstreamModelOptions] = useState<Array<{value: string; label: string}>>([]);
    const [loadingUpstreamModels, setLoadingUpstreamModels] = useState(false);
    const [upstreamModelsError, setUpstreamModelsError] = useState('');
    const [savingForwarding, setSavingForwarding] = useState(false);
    const forwarding = session?.metadata?.upstreamForwarding as {enabled?: boolean; upstreamId?: string; model?: string} | undefined;
    const continuousForwarding = forwarding?.enabled === true;

    const [think, setThink] = useState('');

    const [toolName, setToolName] = useState('');
    const [toolArgs, setToolArgs] = useState('{\n  \n}');
    const [toolContent, setToolContent] = useState('');

    const [errorStatus, setErrorStatus] = useState(429);
    const [errorMessage, setErrorMessage] = useState('Rate limit exceeded');
    const [errorType, setErrorType] = useState('rate_limit_error');
    const [errorCode, setErrorCode] = useState<string>('rate_limit');

    const waiting = interaction?.status === 'waiting';
    const selectedUpstream = upstreams.find((item) => item.id === upstreamId && item.enabled);
    useEffect(() => {
        const savedId = forwarding?.upstreamId;
        setUpstreamId(upstreams.some((item) => item.enabled && item.id === savedId)
            ? savedId!
            : upstreams.find((item) => item.enabled)?.id ?? '');
        setUpstreamModel(forwarding?.model ?? '');
    }, [session?.id, forwarding?.upstreamId, forwarding?.model, upstreams]);
    const updateForwarding = async (enabled: boolean, nextUpstreamId = upstreamId, nextModel = upstreamModel) => {
        if (!session) return;
        setSavingForwarding(true);
        try {
            const metadata = {...session.metadata, upstreamForwarding: {enabled, ...(nextUpstreamId ? {upstreamId: nextUpstreamId} : {}), ...(nextModel.trim() ? {model: nextModel.trim()} : {})}};
            onSessionUpdated(await sessionApi.update(session.id, {metadata}));
            message.success(enabled ? t('panel.forwardingOn') : t('panel.forwardingOff'));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSavingForwarding(false);
        }
    };
    const upstreamModelHint = loadingUpstreamModels
        ? t('panel.loadingModels')
        : upstreamModelsError
            ? t('panel.modelsError', {error: upstreamModelsError})
            : selectedUpstream?.model
                ? t('panel.modelsFromUpstreamDefault', {model: selectedUpstream.model})
                : t('panel.modelsFromUpstream');

    useEffect(() => {
        if (!upstreams.some((item) => item.id === upstreamId && item.enabled)) {
            setUpstreamId(upstreams.find((item) => item.enabled)?.id ?? '');
        }
    }, [upstreamId, upstreams]);

    useEffect(() => {
        if (!selectedUpstream) {
            setUpstreamModelOptions([]);
            setUpstreamModelsError('');
            setLoadingUpstreamModels(false);
            return;
        }

        let cancelled = false;
        setLoadingUpstreamModels(true);
        setUpstreamModelsError('');
        void upstreamApi.models({
            baseUrl: selectedUpstream.baseUrl,
            apiKey: selectedUpstream.apiKey,
        }).then(({models}) => {
            if (cancelled) return;
            setUpstreamModelOptions(models.map((model) => ({
                value: model.id,
                label: model.name ? `${model.id} · ${model.name}` : model.id,
            })));
        }).catch((error) => {
            if (cancelled) return;
            setUpstreamModelOptions([]);
            setUpstreamModelsError(error instanceof Error ? error.message : String(error));
        }).finally(() => {
            if (!cancelled) setLoadingUpstreamModels(false);
        });

        return () => {
            cancelled = true;
        };
    }, [selectedUpstream]);

    useEffect(() => {
        // 切换到新的等待请求时清空输入，避免误发上一条内容。
        setReply('');
        setThink('');
    }, [interaction?.id]);

    useEffect(() => {
        if (interaction) setTab('reply');
        setReplyMode('manual');
    }, [interaction]);

    const run = async (task: () => Promise<unknown>, successText: string) => {
        if (!interaction) return;
        setSending(true);
        try {
            await task();
            message.success(successText);
            onApplied();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSending(false);
        }
    };

    const parseJson = (text: string): Record<string, unknown> | string => {
        const trimmed = text.trim();
        if (!trimmed) return {};
        try {
            return JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            // 解析不了就原样透传：OpenAI 的 arguments 本来就是字符串。
            return trimmed;
        }
    };

    const toolOptions = tools.map((tool) => ({value: tool.name, label: tool.name}));
    const requestTools = [
        ...(interaction?.request.tools ?? []).flatMap((tool) => {
            if (!tool.function?.name) return [];
            return [{
                name: tool.function.name,
                description: tool.function.description ?? '',
                parameters: (tool.function.parameters ?? {}) as Record<string, unknown>,
            }];
        }),
        ...((interaction?.request.functions ?? []) as Array<Record<string, unknown>>).flatMap((tool) => {
            const name = typeof tool.name === 'string' ? tool.name : '';
            if (!name) return [];
            return [{
                name,
                description: typeof tool.description === 'string' ? tool.description : '',
                parameters: (tool.parameters ?? {}) as Record<string, unknown>,
            }];
        }),
    ].filter((tool, index, all) => all.findIndex((item) => item.name === tool.name) === index);
    const mergedToolOptions = [
        ...requestTools.map((tool) => ({value: tool.name, label: t('panel.toolFromRequest', {name: tool.name})})),
        ...toolOptions.filter((tool) => !requestTools.some((requestTool) => requestTool.name === tool.value)),
    ];
    const selectedTool = requestTools.find((tool) => tool.name === toolName)
        ?? tools.find((tool) => tool.name === toolName);
    const generateToolArgs = (name: string) => {
        const tool = requestTools.find((item) => item.name === name)
            ?? tools.find((item) => item.name === name);
        if (!tool) return;
        setToolArgs(formatJsonSchemaExample(tool.parameters));
    };

    if (!interaction) {
        return (
            <Alert
                type="info"
                showIcon
                title={t('panel.noSelection')}
                description={t('panel.noSelectionHint')}
            />
        );
    }

    return (
        <div>
            {interaction ? (
                <Flex align="center" gap={12} wrap style={{marginBottom: 16}}>
                    <Text strong style={{fontSize: 15}}>Mock Response</Text>
                    <Text type="secondary">{t('panel.requestNo', {seq: interaction.sequence})}</Text>
                    {waiting ? <Tag color="gold" style={{marginInlineEnd: 0}}>{t('panel.waitingTag')}</Tag> : <Tag
                        style={{marginInlineEnd: 0}}>{interaction.status === 'completed' ? t('panel.completedTag') : interaction.status}</Tag>}
                </Flex>
            ) : null}

            <Tabs
                size="small"
                activeKey={tab}
                onChange={setTab}
                tabPlacement="start"
                type="card"
                tabBarGutter={8}
                tabBarStyle={{width: 124}}
                items={[
                    {
                        key: 'reply',
                        label: 'Reply',
                        children: (
                            <TabBody>
                                <Tabs
                                    size="small"
                                    activeKey={replyMode}
                                    onChange={setReplyMode}
                                    items={[
                                        {
                                            key: 'manual',
                                            label: t('panel.tabReply'),
                                            children: (
                                                <TabBody>
                                                    <Input.TextArea
                                                        size="small"
                                                        variant="filled"
                                                        value={reply}
                                                        onChange={(event) => setReply(event.target.value)}
                                                        placeholder={t('panel.replyPlaceholder')}
                                                        autoSize={{minRows: 4, maxRows: 10}}
                                                        disabled={!waiting}
                                                    />
                                                    <ActionBar hint={t('panel.replyHint')}>
                                                        <Select
                                                            size="small"
                                                            variant="filled"
                                                            value={finishReason}
                                                            onChange={setFinishReason}
                                                            style={{width: 200}}
                                                            options={FINISH_REASONS.map((reason) => ({
                                                                value: reason,
                                                                label: `finish_reason: ${reason}`,
                                                            }))}
                                                            disabled={!waiting}
                                                        />
                                                        <InputNumber
                                                            size="small"
                                                            variant="filled"
                                                            min={0}
                                                            max={600_000}
                                                            step={100}
                                                            value={replyDelay}
                                                            onChange={(value) => setReplyDelay(value ?? 0)}
                                                            addonBefore={t('panel.delayAddon')}
                                                            addonAfter="ms"
                                                            style={{width: 220}}
                                                            disabled={!waiting}
                                                        />
                                                        <Button
                                                            size="small"
                                                            variant="filled"
                                                            color="primary"
                                                            icon={<SendOutlined/>}
                                                            loading={sending}
                                                            disabled={!waiting || reply.trim() === ''}
                                                            onClick={() =>
                                                                run(
                                                                    () => interactionApi.reply(interaction.id, {
                                                                        content: reply,
                                                                        finishReason,
                                                                        delayMs: replyDelay,
                                                                    }),
                                                                    t('panel.replySent'),
                                                                )
                                                            }
                                                        >
                                                            {t('panel.sendReply')}
                                                        </Button>
                                                    </ActionBar>
                                                </TabBody>
                                            ),
                                        },
                                        {
                                            key: 'upstream',
                                            label: t('panel.tabUpstream'),
                                            children: (
                                                <TabBody>
                                                    <Flex gap={12} wrap>
                                                        <Select
                                                            size="small"
                                                            variant="filled"
                                                            value={upstreamId || undefined}
                                                            onChange={(value) => {
                                                                setUpstreamId(value);
                                                                setUpstreamModel('');
                                                                if (continuousForwarding) void updateForwarding(true, value, '');
                                                            }}
                                                            options={upstreams.filter((item) => item.enabled).map((item) => ({value: item.id, label: `${item.name}${item.model ? ` · ${item.model}` : ''}`}))}
                                                            placeholder={t('panel.selectUpstream')}
                                                            style={{width: 280}}
                                                            disabled={!waiting}
                                                        />
                                                        <Select
                                                            size="small"
                                                            variant="filled"
                                                            value={upstreamModel || undefined}
                                                            onChange={(value) => {
                                                                const model = value ?? '';
                                                                setUpstreamModel(model);
                                                                if (continuousForwarding) void updateForwarding(true, upstreamId, model);
                                                            }}
                                                            onSearch={(value) => {
                                                                if (value && !upstreamModelOptions.some((item) => item.value === value)) {
                                                                    setUpstreamModelOptions((current) => [...current, {value, label: value}]);
                                                                }
                                                            }}
                                                            showSearch={{optionFilterProp: 'label'}}
                                                            allowClear
                                                            loading={loadingUpstreamModels}
                                                            options={upstreamModelOptions}
                                                            placeholder={selectedUpstream?.model ? t('panel.modelDefault', {model: selectedUpstream.model}) : t('panel.modelPlaceholder')}
                                                            style={{flex: 1, minWidth: 260}}
                                                            disabled={!waiting}
                                                        />
                                                    </Flex>
                                                    <ActionBar hint={upstreamModelHint}>
                                                        <Space size={8}>
                                                            <Switch size="small" checked={continuousForwarding} loading={savingForwarding} onChange={(checked) => void updateForwarding(checked)} disabled={!session || (!continuousForwarding && !selectedUpstream)} />
                                                            <Text>{t('panel.keepForwarding')}</Text>
                                                        </Space>
                                                        <Button
                                                            size="small"
                                                            icon={<CloudServerOutlined/>}
                                                            loading={sending}
                                                            disabled={!waiting || !upstreamId}
                                                            onClick={() =>
                                                                run(
                                                                    () => interactionApi.upstream(interaction.id, {
                                                                        upstreamId,
                                                                        ...(upstreamModel.trim() ? {model: upstreamModel.trim()} : {}),
                                                                    }),
                                                                    t('panel.upstreamSent'),
                                                                )
                                                            }
                                                        >
                                                            {t('panel.forwardToUpstream')}
                                                        </Button>
                                                    </ActionBar>
                                                </TabBody>
                                            ),
                                        },
                                    ]}
                                />
                            </TabBody>
                        ),
                    },
                    {
                        key: 'think',
                        label: 'Think',
                        children: (
                            <TabBody>
                                <Input.TextArea
                                    size="small"
                                    value={think}
                                    onChange={(event) => setThink(event.target.value)}
                                    placeholder={t('panel.thinkPlaceholder')}
                                    autoSize={{minRows: 4, maxRows: 10}}
                                    disabled={!waiting}
                                />
                                <ActionBar
                                    hint={t('panel.thinkHint')}>
                                    <Button
                                        icon={<ThunderboltOutlined/>}
                                        loading={sending}
                                        disabled={!waiting || think.trim() === ''}
                                        onClick={() =>
                                            run(async () => {
                                                await interactionApi.think(interaction.id, {content: think});
                                                setThink('');
                                            }, t('panel.thinkSent'))
                                        }
                                    >
                                        {t('panel.sendThink')}
                                    </Button>
                                </ActionBar>
                            </TabBody>
                        ),
                    },
                    {
                        key: 'tool_call',
                        label: 'Tool Call',
                        children: (
                            <TabBody>
                                <Flex gap={12} wrap>
                                    <AutoComplete
                                        size="small"
                                        variant={"filled"}
                                        style={{width: 380}}
                                        value={toolName}
                                        onChange={setToolName}
                                        onSelect={(value) => {
                                            setToolName(value);
                                            generateToolArgs(value);
                                        }}
                                        options={mergedToolOptions}
                                        placeholder={t('panel.toolNamePlaceholder')}
                                        disabled={!waiting}

                                    />
                                    <Input
                                        size="small"
                                        variant={"filled"}
                                        style={{flex: 1, minWidth: 260}}
                                        value={toolContent}
                                        onChange={(event) => setToolContent(event.target.value)}
                                        placeholder={t('panel.toolContentPlaceholder')}
                                        disabled={!waiting}
                                    />
                                </Flex>
                                <Flex align="center" justify="space-between" gap={12} wrap>
                                    <Text type="secondary">
                                        Arguments（JSON）{selectedTool?.description ? ` · ${selectedTool.description}` : ''}
                                    </Text>
                                    <Button
                                        size="small"
                                        icon={<ThunderboltOutlined/>}
                                        disabled={!waiting || !selectedTool}
                                        onClick={() => generateToolArgs(toolName)}
                                    >
                                        {t('panel.generateSampleJson')}
                                    </Button>
                                </Flex>
                                <MonacoEditor
                                    value={toolArgs}
                                    onChange={setToolArgs}
                                    language="json"
                                    height={180}
                                    readOnly={!waiting}
                                    placeholder="Tool arguments JSON"
                                />
                                <ActionBar hint={t('panel.toolCallHint')}>
                                    {requestTools.length > 0 && (
                                        <Button
                                            size="small"
                                            variant={"filled"}
                                            color="default"
                                            icon={<CloudSyncOutlined/>}
                                            loading={sending}
                                            disabled={!waiting}
                                            onClick={() =>
                                                run(
                                                    async () => {
                                                        await toolApi.sync(interaction.projectId, requestTools);
                                                    },
                                                    t('panel.toolsSynced'),
                                                )
                                            }
                                        >
                                            {t('panel.syncRequestTools')}
                                        </Button>
                                    )}
                                    <Button
                                        size="small"
                                        variant={"filled"}
                                        color="default"
                                        icon={<SendOutlined/>}
                                        loading={sending}
                                        disabled={!waiting || toolName.trim() === ''}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    interactionApi.toolCall(interaction.id, {
                                                        name: toolName.trim(),
                                                        arguments: parseJson(toolArgs),
                                                        ...(toolContent ? {content: toolContent} : {}),
                                                    }),
                                                t('panel.toolCallSent'),
                                            )
                                        }
                                    >
                                        {t('panel.sendToolCall')}
                                    </Button>
                                </ActionBar>
                            </TabBody>
                        ),
                    },
                    {
                        key: 'error',
                        label: 'Error',
                        children: (
                            <TabBody>
                                <Segmented
                                    options={ERROR_PRESETS.map((preset) => ({
                                        label: preset.label,
                                        value: String(preset.status),
                                    }))}
                                    value={String(errorStatus)}
                                    onChange={(value) => {
                                        const preset = ERROR_PRESETS.find((item) => String(item.status) === value);
                                        if (!preset) return;
                                        setErrorStatus(preset.status);
                                        setErrorMessage(preset.message);
                                        setErrorType(preset.errorType);
                                        setErrorCode(preset.code ?? '');
                                    }}
                                />
                                <Flex gap={12} wrap>
                                    <InputNumber
                                        min={400}
                                        max={599}
                                        value={errorStatus}
                                        onChange={(value) => setErrorStatus(value ?? 500)}
                                        addonBefore="status"
                                        style={{width: 190}}
                                        disabled={!waiting}
                                    />
                                    <Input
                                        style={{width: 260}}
                                        value={errorType}
                                        onChange={(event) => setErrorType(event.target.value)}
                                        addonBefore="type"
                                        disabled={!waiting}
                                    />
                                    <Input
                                        style={{width: 240}}
                                        value={errorCode}
                                        onChange={(event) => setErrorCode(event.target.value)}
                                        addonBefore="code"
                                        disabled={!waiting}
                                    />
                                </Flex>
                                <Input.TextArea
                                    value={errorMessage}
                                    onChange={(event) => setErrorMessage(event.target.value)}
                                    autoSize={{minRows: 2, maxRows: 6}}
                                    disabled={!waiting}
                                />
                                <ActionBar hint={t('panel.errorHint')}>
                                    <Button
                                        color="danger"
                                        variant="solid"
                                        loading={sending}
                                        disabled={!waiting || errorMessage.trim() === ''}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    interactionApi.error(interaction.id, {
                                                        status: errorStatus,
                                                        message: errorMessage,
                                                        errorType,
                                                        code: errorCode || null,
                                                    }),
                                                t('panel.errorSent'),
                                            )
                                        }
                                    >
                                        {t('panel.sendError')}
                                    </Button>
                                    <Button
                                        loading={sending}
                                        disabled={!waiting}
                                        onClick={() =>
                                            run(() => interactionApi.timeout(interaction.id), t('panel.timeoutSent'))
                                        }
                                    >
                                        {t('panel.sendTimeout')}
                                    </Button>
                                </ActionBar>
                            </TabBody>
                        ),
                    },
                ]}
            />
        </div>
    );
}
