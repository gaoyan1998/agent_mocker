import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Input, InputNumber, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ApiLog } from '@agent-mock/shared';
import { logApi } from '../../api/config';
import { JsonBlock } from '../../components/JsonBlock';
import { Page, PageHeader } from '../../components/Page';
import { useT } from '../../i18n';

const { Text } = Typography;

/** API 日志：所有进入 Mock Server 的请求都在这里。 */
export function LogsPage() {
  const { projectId = '' } = useParams();
  const t = useT();
  const { message, modal } = App.useApp();

  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState('');
  const [status, setStatus] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await logApi.list(projectId, {
        limit: 200,
        ...(path ? { path } : {}),
        ...(status ? { status } : {}),
      });
      setLogs(page.items);
      setTotal(page.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, path, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page>
      <PageHeader
        title={t('logs.title')}
        description={t('logs.description', { total })}
        extra={
          <>
            <Input
              allowClear
              
              style={{ width: 260 }}
              placeholder={t('logs.pathPlaceholder')}
              value={path}
              onChange={(event) => setPath(event.target.value)}
              onPressEnter={() => void load()}
            />
            <InputNumber
              
              style={{ width: 140 }}
              placeholder={t('logs.statusPlaceholder')}
              value={status ?? undefined}
              onChange={(value) => setStatus(value ?? null)}
            />
            <Button
              
              icon={<ReloadOutlined />}
              onClick={() => void load()}
              loading={loading}
            >
              {t('logs.query')}
            </Button>
            <Button
              
              danger
              icon={<ClearOutlined />}
              onClick={() =>
                modal.confirm({
                  title: t('logs.clearConfirm'),
                  okText: t('logs.clear'),
                  okButtonProps: { danger: true },
                  cancelText: t('common.cancel'),
                  onOk: async () => {
                    await logApi.clear(projectId);
                    message.success(t('logs.cleared'));
                    await load();
                  },
                })
              }
            >
              {t('logs.clear')}
            </Button>
          </>
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table<ApiLog>
          rowKey="id"
          loading={loading}
          dataSource={logs}
          scroll={{ x: 1080 }}
          pagination={{ pageSize: 20, showSizeChanger: true, style: { paddingInline: 24 } }}
          expandable={{
            expandedRowRender: (log) => (
              <Flex gap={24} wrap style={{ padding: '8px 0' }}>
                <Space orientation="vertical" size={8} style={{ minWidth: 280, flex: 1 }}>
                  <Text type="secondary">Request Headers</Text>
                  <JsonBlock value={log.requestHeaders} maxHeight={200} />
                </Space>
                <Space orientation="vertical" size={8} style={{ minWidth: 280, flex: 1 }}>
                  <Text type="secondary">Request Body</Text>
                  <JsonBlock value={log.requestBody} maxHeight={200} />
                </Space>
                <Space orientation="vertical" size={8} style={{ minWidth: 280, flex: 1 }}>
                  <Text type="secondary">Response</Text>
                  <JsonBlock value={log.responseBody} maxHeight={200} />
                </Space>
              </Flex>
            ),
          }}
          columns={[
            {
              title: t('common.time'),
              dataIndex: 'createdAt',
              width: 200,
              render: (value: number) => (
                <Text style={{ fontSize: 13 }} className="mock-mono">
                  {dayjs(value).format('YYYY-MM-DD HH:mm:ss.SSS')}
                </Text>
              ),
            },
            { title: t('logs.colMethod'), dataIndex: 'method', width: 100 },
            {
              title: t('logs.colPath'),
              dataIndex: 'path',
              width: 260,
              render: (value: string) => (
                <Text className="mock-mono" style={{ fontSize: 13 }}>
                  {value}
                </Text>
              ),
            },
            {
              title: t('common.status'),
              dataIndex: 'status',
              width: 100,
              render: (value: number) => (
                <Tag
                  color={value >= 500 ? 'red' : value >= 400 ? 'orange' : 'green'}
                  style={{ marginInlineEnd: 0 }}
                >
                  {value}
                </Tag>
              ),
            },
            {
              title: t('common.duration'),
              dataIndex: 'durationMs',
              width: 110,
              render: (value: number) => `${value} ms`,
            },
            {
              title: 'Session',
              dataIndex: 'sessionId',
              width: 210,
              render: (value: string | null) =>
                value ? (
                  <Text className="mock-mono" style={{ fontSize: 13 }} copyable>
                    {value}
                  </Text>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
          ]}
        />
      </Card>
    </Page>
  );
}
