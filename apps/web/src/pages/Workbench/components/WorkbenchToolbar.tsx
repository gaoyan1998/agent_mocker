import {
    CheckCircleOutlined,
    PlusOutlined,
    QuestionCircleOutlined,
    ReloadOutlined,
    RollbackOutlined,
    SettingOutlined,
} from "@ant-design/icons";
import {
    Button,
    Divider,
    Flex,
    Space,
    Tag,
    Tooltip,
    Typography,
    theme,
} from "antd";
import type {DebugSession} from "@agent-mock/shared";
import {SessionStatusTag} from "@/components/labels";
import {useT} from "@/i18n";
import {useWorkbenchStore} from "@/stores/workbench";

const {Text, Title} = Typography;

interface WorkbenchToolbarProps {
    session: DebugSession | null;
    bindingCount: number;
    onOpenBindings: () => void;
    onOpenConnect: () => void;
    onRefresh: () => void;
    onEnd: () => void;
    onReopen: () => void;
    onNew: () => void;
}

export function WorkbenchToolbar(
    {
        session,
        bindingCount,
        onOpenBindings,
        onOpenConnect,
        onRefresh,
        onEnd,
        onReopen,
        onNew,
    }: WorkbenchToolbarProps) {

    const store = useWorkbenchStore();


    const t = useT();
    const {token} = theme.useToken();
    const sessionUrl = session?.externalId
        ? `${window.location.origin}/${encodeURIComponent(session.externalId)}/v1`
        : null;
    return (
        <Flex
            align="center"
            gap={16}
            wrap
            style={{
                padding: "12px 24px",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
            }}
        >
            <Button
                icon={<SettingOutlined/>}
                disabled={!session}
                onClick={onOpenBindings}
            >
                {t('workbench.bindings')}
                {bindingCount > 0 ? ` (${bindingCount})` : ""}
            </Button>
            <Divider vertical style={{height: 24, marginInline: 0}}/>
            <Title level={5} style={{margin: 0, maxWidth: 320}} ellipsis>
                {session?.name ?? t('workbench.noSession')}
            </Title>
            <Space size={8}>
                {session && <SessionStatusTag status={session.status}/>}{" "}
                {session?.replaySourceId && <Tag color="cyan">{t('workbench.replaying')}</Tag>}
            </Space>
            {session && (
                <Text type="secondary">
                    {t('workbench.interactionCount', {count: session.interactionCount})}
                </Text>
            )}
            <Space size={16} style={{marginLeft: "auto"}}>
                <Space size={8}>
                    <Text type="secondary">{t('workbench.sessionUrl')}</Text>
                    <Text
                        copyable={sessionUrl ? {text: sessionUrl} : false}
                        strong
                        className="mock-mono"
                        style={{
                            color: session?.externalId
                                ? token.colorPrimary
                                : token.colorTextDisabled,
                        }}
                    >
                        {sessionUrl ?? "—"}
                    </Text>
                </Space>
                <Tooltip title={t('workbench.connectTip')}>
                    <Button
                        variant="filled"
                        color="default"
                        icon={<QuestionCircleOutlined/>}
                        onClick={onOpenConnect}
                        aria-label={t('workbench.connectTip')}
                    >
                        {t('workbench.connectTutorial')}
                    </Button>
                </Tooltip>
                <Divider vertical style={{height: 20, marginInline: 0}}/>
                <Tooltip title={t('workbench.refreshTip')}>
                    <Button icon={<ReloadOutlined/>} onClick={onRefresh}/>
                </Tooltip>
                {session?.status === "active" ? (
                    <Button icon={<CheckCircleOutlined/>} onClick={onEnd}>
                        {t('workbench.endSession')}
                    </Button>
                ) : (
                    session && (
                        <Button icon={<RollbackOutlined/>} onClick={onReopen}>
                            {t('workbench.reopenSession')}
                        </Button>
                    )
                )}
                <Button
                    color="primary"
                    variant="solid"
                    icon={<PlusOutlined/>}
                    onClick={onNew}
                >
                    {t('workbench.newSession')}
                </Button>
            </Space>
        </Flex>
    );
}
