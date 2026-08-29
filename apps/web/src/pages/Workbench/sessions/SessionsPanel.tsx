import { App, Empty, Space } from 'antd';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useWorkbenchStore } from '@/stores/workbench';
import { SessionCard } from './SessionCard';

/** 左侧会话列表：一次 Agent 运行 = 一个 Session。 */
export function SessionsPanel() {
  const { modal } = App.useApp();
  const run = useAsyncAction();
  const sessions = useWorkbenchStore((state) => state.sessions);
  const activeId = useWorkbenchStore((state) => state.sessionId);
  const selectSession = useWorkbenchStore((state) => state.selectSession);
  const replaySession = useWorkbenchStore((state) => state.replaySession);
  const resetSession = useWorkbenchStore((state) => state.resetSession);
  const deleteSession = useWorkbenchStore((state) => state.deleteSession);

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '48px 24px' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
      </div>
    );
  }

  return (
    <Space orientation="vertical" size={10} style={{ width: '100%', padding: 16 }}>
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          active={session.id === activeId}
          onSelect={() => void run(() => selectSession(session.id))}
          onReplay={() =>
            void run(
              () => replaySession(session.id),
              '已创建回放会话，请将 API 地址改为带新会话 ID 的 /<sessionId>/v1 后重跑 Agent',
            )
          }
          onReset={() =>
            modal.confirm({
              title: `重置会话「${session.name}」的记录？`,
              content:
                '当前会话的所有交互、事件和场景进度都会被清空，之后可使用同一个会话 URL 从头记录。',
              okText: '重置',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => run(() => resetSession(session.id), '回放记录已重置，可从头开始记录'),
            })
          }
          onDelete={() =>
            modal.confirm({
              title: `删除会话「${session.name}」？`,
              content: '该会话下的所有交互与事件记录都会被删除。',
              okText: '删除',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => run(() => deleteSession(session.id), '会话已删除'),
            })
          }
        />
      ))}
    </Space>
  );
}
