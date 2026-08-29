import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Flex,
  Skeleton,
  Space,
  Statistic,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { systemApi, type SystemInfo } from '../../api/config';
import { ConnectSnippets } from '../../components/ConnectSnippets';
import { Page, PageHeader } from '../../components/Page';
import { useProjectStore } from '../../stores/project';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { useT } from '../../i18n';

const { Text } = Typography;

/** 全局设置 / 服务信息。 */
export function GlobalSettingsPage() {
  const t = useT();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const projects = useProjectStore((state) => state.projects);
  const loadProjects = useProjectStore((state) => state.loadProjects);

  const load = async () => {
    setLoading(true);
    try {
      setInfo(await systemApi.info());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadProjects();
  }, [loadProjects]);

  if (!info) return <Skeleton active style={{ padding: 32 }} paragraph={{ rows: 8 }} />;

  const firstKey = projects[0]?.apiKey ?? 'sk-mock-xxxxxxxx';

  return (
    <Page gap={28}>
      <PageHeader
        title={t('globalSettings.title')}
        description={`${info.name} v${info.version}`}
        extra={
          <>
            <LanguageSwitch />
            <Button
            
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
          >
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      <Flex gap={24} wrap align="flex-start">
        <Card title={t('globalSettings.runtime')} style={{ flex: 1, minWidth: 460 }}>
          <Space orientation="vertical" size={28} style={{ width: '100%' }}>
            <Flex gap={40} wrap>
              <Statistic title={t('globalSettings.statProjects')} value={info.projectCount} />
              <Statistic title={t('globalSettings.statSessions')} value={info.sessionCount} />
              <Statistic title={t('globalSettings.statInteractions')} value={info.interactionCount} />
              <Statistic title={t('globalSettings.statPending')} value={info.pendingRequests} />
              <Statistic title={t('globalSettings.statSse')} value={info.sseSubscribers} />
            </Flex>
            <Descriptions
              column={1}
              styles={{ label: { width: 116 } }}
              items={[
                {
                  key: 'mock',
                  label: 'Mock API',
                  children: (
                    <Text copyable className="mock-mono" style={{ fontSize: 13 }}>
                      {info.mockBaseUrl}
                    </Text>
                  ),
                },
                {
                  key: 'api',
                  label: t('globalSettings.adminApi'),
                  children: (
                    <Text className="mock-mono" style={{ fontSize: 13 }}>
                      {info.baseUrl}
                    </Text>
                  ),
                },
                {
                  key: 'db',
                  label: t('globalSettings.database'),
                  children: (
                    <Text className="mock-mono" style={{ fontSize: 13 }}>
                      {info.databasePath}
                    </Text>
                  ),
                },
                {
                  key: 'started',
                  label: t('globalSettings.startedAt'),
                  children: dayjs(info.startedAt).format('YYYY-MM-DD HH:mm:ss'),
                },
                {
                  key: 'strict',
                  label: t('globalSettings.apiKeyCheck'),
                  children: info.strictApiKey
                    ? t('globalSettings.apiKeyStrict')
                    : t('globalSettings.apiKeyLoose'),
                },
              ]}
            />
          </Space>
        </Card>

        <Card title={t('globalSettings.connect')} style={{ flex: 1, minWidth: 460 }}>
          <ConnectSnippets apiKey={firstKey} mockBaseUrl={info.mockBaseUrl} />
        </Card>
      </Flex>

      <Alert
        type="info"
        showIcon
        title={t('globalSettings.env')}
        description={
          <Space orientation="vertical" size={8} style={{ marginTop: 4 }}>
            <span>
              <Text code>MOCK_PORT</Text> {t('globalSettings.envPort')}
            </span>
            <span>
              <Text code>MOCK_DB_PATH</Text> {t('globalSettings.envDbPath')}
            </span>
            <span>
              <Text code>MOCK_STRICT_API_KEY=false</Text> {t('globalSettings.envStrictKey')}
            </span>
            <span>
              <Text code>MOCK_LOG_LEVEL</Text> {t('globalSettings.envLogLevel')}
            </span>
          </Space>
        }
      />
    </Page>
  );
}
