import {
  CheckCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Button, Divider, Flex, Space, Tag, Tooltip, Typography, theme } from 'antd';
import { SessionStatusTag } from '@/components/labels';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useBindingCount, useCurrentSession, useWorkbenchStore } from '@/stores/workbench';
import { useWorkbenchUiStore } from '../uiStore';

const { Text, Title } = Typography;

/** 工作台顶部工具栏：当前会话概要 + 会话级操作。 */
export function WorkbenchToolbar() {
  const { token } = theme.useToken();
  const run = useAsyncAction();
  const session = useCurrentSession();
  const bindingCount = useBindingCount();
  const openBindings = useWorkbenchUiStore((state) => state.openBindings);
  const openConnect = useWorkbenchUiStore((state) => state.openConnect);
  // store 里的 action 引用是稳定的，用 selector 取不会带来额外渲染。
  const refreshInteractions = useWorkbenchStore((state) => state.refreshInteractions);
  const endSession = useWorkbenchStore((state) => state.endSession);
  const reopenSession = useWorkbenchStore((state) => state.reopenSession);
  const newSession = useWorkbenchStore((state) => state.newSession);
  const sessionUrl = session?.externalId
    ? `${window.location.origin}/${encodeURIComponent(session.externalId)}/v1`
    : null;

  return (
    <Flex
      align="center"
      gap={16}
      wrap
      style={{
        padding: '12px 24px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      <Button icon={<SettingOutlined />} disabled={!session} onClick={openBindings}>
        规则与场景{bindingCount > 0 ? ` (${bindingCount})` : ''}
      </Button>
      <Divider vertical style={{ height: 24, marginInline: 0 }} />
      <Title level={5} style={{ margin: 0, maxWidth: 320 }} ellipsis>
        {session?.name ?? '未选择会话'}
      </Title>
      <Space size={8}>
        {session && <SessionStatusTag status={session.status} />}{' '}
        {session?.replaySourceId && <Tag color="cyan">回放中</Tag>}
      </Space>
      {session && <Text type="secondary">{session.interactionCount} 次交互</Text>}

      <Space size={16} style={{ marginLeft: 'auto' }}>
        <Space size={8}>
          <Text type="secondary">会话 URL</Text>
          <Text
            copyable={sessionUrl ? { text: sessionUrl } : false}
            strong
            className="mock-mono"
            style={{
              color: session?.externalId ? token.colorPrimary : token.colorTextDisabled,
            }}
          >
            {sessionUrl ?? '—'}
          </Text>
        </Space>
        <Tooltip title="查看接入方式">
          <Button
            variant="filled"
            color="default"
            icon={<QuestionCircleOutlined />}
            onClick={openConnect}
            aria-label="查看接入方式"
          >
            接入教程
          </Button>
        </Tooltip>
        <Divider vertical style={{ height: 20, marginInline: 0 }} />
        <Tooltip title="重新拉取当前会话的交互记录">
          <Button icon={<ReloadOutlined />} onClick={() => void run(refreshInteractions)} />
        </Tooltip>
        {session?.status === 'active' ? (
          <Button
            icon={<CheckCircleOutlined />}
            onClick={() => void run(() => endSession(session.id), '会话已结束')}
          >
            结束会话
          </Button>
        ) : (
          session && (
            <Button
              icon={<RollbackOutlined />}
              onClick={() => void run(() => reopenSession(session.id), '会话已重新打开')}
            >
              重新打开
            </Button>
          )
        )}
        <Button
          color="primary"
          variant="solid"
          icon={<PlusOutlined />}
          onClick={() => void run(() => newSession(), '已创建新会话')}
        >
          新建会话
        </Button>
      </Space>
    </Flex>
  );
}
