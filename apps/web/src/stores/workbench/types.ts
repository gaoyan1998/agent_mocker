import type { DebugSession, Interaction, StreamEvent } from '@agent-mock/shared';

export interface Selection {
  interactionId: string | null;
  /** null 表示看整个 Interaction，否则看其中某个事件。 */
  eventId: string | null;
}

export const EMPTY_SELECTION: Selection = { interactionId: null, eventId: null };

export interface WorkbenchState {
  projectId: string | null;
  sessions: DebugSession[];
  sessionId: string | null;
  interactions: Interaction[];
  selection: Selection;
  loadingSessions: boolean;
  loadingInteractions: boolean;
  connected: boolean;

  bootstrap: (projectId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  refreshInteractions: () => Promise<void>;
  select: (interactionId: string | null, eventId?: string | null) => void;
  newSession: (name?: string) => Promise<DebugSession>;
  endSession: (sessionId: string) => Promise<void>;
  reopenSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  replaySession: (sessionId: string) => Promise<DebugSession>;
  resetSession: (sessionId: string) => Promise<void>;
  updateSessionBindings: (ruleIds: string[], scenarioIds: string[]) => Promise<void>;
  setSession: (session: DebugSession) => void;
  handleEvent: (event: StreamEvent) => void;
  setConnected: (connected: boolean) => void;
}

/** zustand 的 set / get，抽出来给拆到别处的 reducer 用。 */
export type SetState = (
  partial:
    | Partial<WorkbenchState>
    | ((state: WorkbenchState) => Partial<WorkbenchState>),
) => void;

export type GetState = () => WorkbenchState;
