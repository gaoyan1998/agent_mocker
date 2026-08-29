import {
  ApiOutlined,
  BranchesOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  MessageOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import type { ReactNode } from 'react';
import type {
  InteractionEventType,
  InteractionMode,
  InteractionStatus,
  SessionStatus,
} from '@agent-mock/shared';
import { useT } from '../i18n';

type Meta = { label: string; color: string };
/** 需要翻译的标签只存 key，渲染时用 useT() 取文案。 */
type I18nMeta = { labelKey: string; color: string };

export const STATUS_META: Record<InteractionStatus, I18nMeta> = {
  pending: { labelKey: 'status.pending', color: 'blue' },
  waiting: { labelKey: 'status.waiting', color: 'gold' },
  completed: { labelKey: 'status.completed', color: 'green' },
  error: { labelKey: 'status.error', color: 'red' },
  timeout: { labelKey: 'status.timeout', color: 'volcano' },
  aborted: { labelKey: 'status.aborted', color: 'default' },
};

export const MODE_META: Record<InteractionMode, I18nMeta> = {
  pending: { labelKey: 'mode.pending', color: 'default' },
  manual: { labelKey: 'mode.manual', color: 'gold' },
  rule: { labelKey: 'mode.rule', color: 'geekblue' },
  scenario: { labelKey: 'mode.scenario', color: 'purple' },
  replay: { labelKey: 'mode.replay', color: 'cyan' },
  auto: { labelKey: 'mode.auto', color: 'default' },
};

export const SESSION_STATUS_META: Record<SessionStatus, I18nMeta> = {
  active: { labelKey: 'sessionStatus.active', color: 'green' },
  completed: { labelKey: 'sessionStatus.completed', color: 'default' },
  archived: { labelKey: 'sessionStatus.archived', color: 'default' },
};

// 事件类型的名字是协议里的术语（REQUEST / TOOL CALL …），两种语言都不翻译。
export const EVENT_META: Record<InteractionEventType, Meta & { icon: ReactNode }> = {
  request: { label: 'REQUEST', color: 'blue', icon: <ApiOutlined /> },
  decision: { label: 'DECISION', color: 'geekblue', icon: <BranchesOutlined /> },
  think: { label: 'THINK', color: 'purple', icon: <BulbOutlined /> },
  tool_call: { label: 'TOOL CALL', color: 'orange', icon: <ToolOutlined /> },
  tool_result: { label: 'TOOL RESULT', color: 'cyan', icon: <DatabaseOutlined /> },
  assistant: { label: 'ASSISTANT', color: 'green', icon: <MessageOutlined /> },
  delay: { label: 'DELAY', color: 'default', icon: <ClockCircleOutlined /> },
  error: { label: 'ERROR', color: 'red', icon: <CloseCircleOutlined /> },
};

export function StatusTag({ status }: { status: InteractionStatus }) {
  const t = useT();
  const meta = STATUS_META[status];
  return <Tag color={meta.color}>{t(meta.labelKey)}</Tag>;
}

export function ModeTag({ mode }: { mode: InteractionMode }) {
  const t = useT();
  const meta = MODE_META[mode];
  return <Tag color={meta.color}>{t(meta.labelKey)}</Tag>;
}

export function SessionStatusTag({ status }: { status: SessionStatus }) {
  const t = useT();
  const meta = SESSION_STATUS_META[status];
  return <Tag color={meta.color}>{t(meta.labelKey)}</Tag>;
}
