import type { DebugSession, Interaction, InteractionEvent } from '@agent-mock/shared';
import { useWorkbenchStore } from './store';

/**
 * 派生状态统一放这里，各面板直接订阅自己要的那一份。
 * 这些 selector 返回的都是数组里的元素引用或原始值，
 * zustand 默认的 Object.is 比较就足够稳定，不需要额外的 shallow。
 */

/** 当前选中的会话。 */
export function useCurrentSession(): DebugSession | null {
  return useWorkbenchStore(
    (state) => state.sessions.find((item) => item.id === state.sessionId) ?? null,
  );
}

/** 时间线里选中的那条交互。 */
export function useSelectedInteraction(): Interaction | null {
  return useWorkbenchStore(
    (state) =>
      state.interactions.find((item) => item.id === state.selection.interactionId) ?? null,
  );
}

/** 选中交互内部选中的那个事件；没选事件时为 null（此时看整条交互）。 */
export function useSelectedEvent(): InteractionEvent | null {
  return useWorkbenchStore((state) => {
    if (!state.selection.eventId) return null;
    const interaction = state.interactions.find(
      (item) => item.id === state.selection.interactionId,
    );
    if (!interaction) return null;
    return (interaction.events ?? []).find((item) => item.id === state.selection.eventId) ?? null;
  });
}

/**
 * Action Panel 操作的目标交互：优先当前选中的（如果它在等待人工），
 * 否则取会话里第一条 waiting 的，都没有就退回选中项（只读展示）。
 */
export function useActionTarget(): Interaction | null {
  return useWorkbenchStore((state) => {
    const selected =
      state.interactions.find((item) => item.id === state.selection.interactionId) ?? null;
    if (selected?.status === 'waiting') return selected;
    return state.interactions.find((item) => item.status === 'waiting') ?? selected;
  });
}

/** 当前会话绑定的规则 + 场景总数，用于工具栏上的角标。 */
export function useBindingCount(): number {
  return useWorkbenchStore((state) => {
    const session = state.sessions.find((item) => item.id === state.sessionId);
    return (session?.ruleIds.length ?? 0) + (session?.scenarioIds.length ?? 0);
  });
}
