import {
    ApartmentOutlined, ApiOutlined,
    ArrowLeftOutlined, BulbFilled, BulbOutlined,
    DashboardOutlined,
    FileTextOutlined,
    HistoryOutlined,
    NodeIndexOutlined,
    SettingOutlined,
    ToolOutlined,
    CloudServerOutlined,
} from '@ant-design/icons';
import {
    Badge,
    Flex,
    Layout,
    Menu,
    Result,
    Skeleton,
    Space,
    Tag,
    Typography,
    theme,
    Divider,
    Tooltip,
    Button
} from 'antd';
import {useEffect, useMemo} from 'react';
import {Link, Outlet, useLocation, useNavigate, useParams} from 'react-router-dom';
import {useProjectStream} from '../hooks/useProjectStream';
import {useProjectStore} from '../stores/project';
import {useWorkbenchStore} from '../stores/workbench';
import {Header} from "antd/es/layout/layout";
import {useUiStore} from "@/stores/ui";
import {useT} from '../i18n';
import {LanguageSwitch} from '../components/LanguageSwitch';

const {Sider, Content} = Layout;
const {Text} = Typography;

/** label 存翻译 key，渲染时才取文案，切语言能立刻跟上。 */
const MENU_ITEMS = [
    {key: 'workbench', icon: <DashboardOutlined/>, labelKey: 'nav.workbench'},
    {key: 'sessions', icon: <HistoryOutlined/>, labelKey: 'nav.sessions'},
    {key: 'rules', icon: <NodeIndexOutlined/>, labelKey: 'nav.rules'},
    {key: 'scenarios', icon: <ApartmentOutlined/>, labelKey: 'nav.scenarios'},
    {key: 'tools', icon: <ToolOutlined/>, labelKey: 'nav.tools'},
    {key: 'logs', icon: <FileTextOutlined/>, labelKey: 'nav.logs'},
    {key: 'upstream-ai', icon: <CloudServerOutlined/>, labelKey: 'nav.upstreamAi'},
    {key: 'settings', icon: <SettingOutlined/>, labelKey: 'nav.projectSettings'},
];

export function ProjectLayout() {
    const {projectId = ''} = useParams();
    const t = useT();
    const {token} = theme.useToken();
    const navigate = useNavigate();
    const location = useLocation();

    const project = useProjectStore((state) => state.current);
    const loadProject = useProjectStore((state) => state.loadProject);
    const error = useProjectStore((state) => state.error);
    const connected = useWorkbenchStore((state) => state.connected);
    const interactions = useWorkbenchStore((state) => state.interactions);


    const mode = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);

    useEffect(() => {
        void loadProject(projectId);
    }, [projectId, loadProject]);

    // 项目级 SSE 在这里建立，切换页面时不会断开。
    useProjectStream(projectId);

    const waitingCount = useMemo(
        () => interactions.filter((item) => item.status === 'waiting').length,
        [interactions],
    );

    const selectedKey =
        MENU_ITEMS.find((item) => location.pathname.endsWith(`/${item.key}`))?.key ?? 'workbench';

    if (error && !project) {
        return (
            <Result
                status="404"
                title={t('nav.projectNotFound')}
                subTitle={error}
                extra={<Link to="/projects">{t('nav.backToProjects')}</Link>}
            />
        );
    }


    return (
        <Layout style={{height: '100%'}}>
            <Sider
                width={200}
                theme="light"
                style={{
                    background: token.colorBgContainer,
                    borderRight: `1px solid ${token.colorBorderSecondary}`,
                    overflow: 'auto',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingInline: 24,
                        height: 60,
                        lineHeight: `${60}px`,
                        background: token.colorBgContainer,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}>
                    <Link to="/projects" style={{display: 'flex', alignItems: 'center'}}>
                        <ApiOutlined style={{color: token.colorPrimary, fontSize: 22}}/>
                        <Text strong style={{fontSize: 17}}>
                            Agent Mock
                        </Text>
                    </Link>
                </div>

                <Space orientation="vertical" size={14} style={{width: '100%', padding: '24px 20px 20px'}}>
                    <Link to="/projects">
                        <Space size={8}>
                            <ArrowLeftOutlined/>
                            {t('nav.allProjects')}
                        </Space>
                    </Link>

                    {project ? (
                        <Space orientation="vertical" size={6} style={{width: '100%'}}>
                            <Text strong ellipsis style={{display: 'block', fontSize: 16}}>
                                {project.name}
                            </Text>
                            <Space>
                                <Text type="secondary">api_key:</Text>
                                <Text
                                    type="secondary"
                                    copyable={{text: project.apiKey}}
                                    ellipsis
                                    className="mock-mono"
                                    style={{fontSize: 12}}
                                >
                                    {project.apiKey}
                                </Text></Space>
                        </Space>
                    ) : (
                        <Skeleton active paragraph={false}/>
                    )}

                    <Space size={12} style={{marginLeft: 'auto'}}>
                        <LanguageSwitch variant="text" size="small"/>
                        <Tooltip title={mode === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}>
                            <Button
                                variant="text"
                                size="small"
                                icon={mode === 'dark' ? <BulbFilled/> : <BulbOutlined/>}
                                onClick={toggleTheme}
                            />
                        </Tooltip>
                        <Tooltip title={t('nav.globalSettings')}>
                            <Button
                                variant="text"
                                size="small"
                                icon={<SettingOutlined/>}
                                onClick={() => navigate('/settings')}
                                style={{
                                    color: location.pathname === '/settings' ? token.colorPrimary : undefined,
                                }}
                            />
                        </Tooltip>
                    </Space>
                </Space>

                <div
                    style={{
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                        paddingBlock: 12,
                    }}
                >
                    <Menu
                        mode="inline"
                        selectedKeys={[selectedKey]}
                        style={{borderInlineEnd: 'none'}}
                        onClick={({key}) => navigate(`/projects/${projectId}/${key}`)}
                        items={MENU_ITEMS.map((item) => ({
                            key: item.key,
                            icon: item.icon,
                            label:
                                item.key === 'workbench' && waitingCount > 0 ? (
                                    <Flex align="center" justify="space-between" gap={8}>
                                        {t(item.labelKey)}
                                        <Tag color="gold" style={{marginInlineEnd: 0}}>
                                            {waitingCount}
                                        </Tag>
                                    </Flex>
                                ) : (
                                    t(item.labelKey)
                                ),
                        }))}
                    />
                </div>
            </Sider>
            <Content style={{height: '100%', overflow: 'hidden'}}>
                <Outlet/>
            </Content>
        </Layout>
    );
}
