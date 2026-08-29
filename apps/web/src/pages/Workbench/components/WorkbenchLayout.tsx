import { Splitter, theme } from "antd";
import type {
    DebugSession,
    Interaction,
    InteractionEvent,
    MockTool,
    UpstreamConfig,
} from "@agent-mock/shared";
import { ActionPanel } from "@/components/ActionPanel/ActionPanel";
import { Inspector } from "@/components/Inspector/Inspector";
import { SessionList } from "@/components/SessionList";
import { InteractionTimeline } from "@/components/Timeline/InteractionTimeline";

interface Props {
    sessions: DebugSession[];
    activeId: string | null;
    interactions: Interaction[];
    selection: { interactionId: string | null; eventId: string | null };
    actionTarget: Interaction | null;
    session: DebugSession | null;
    selectedInteraction: Interaction | null;
    selectedEvent: InteractionEvent | null;
    tools: MockTool[];
    upstreams: UpstreamConfig[];
    loading: boolean;
    onSelectSession: (id: string) => void;
    onDelete: (id: string) => void;
    onReplay: (id: string) => void;
    onReset: (id: string) => void;
    onSelect: (interactionId: string | null, eventId?: string | null) => void;
    onApplied: () => void;
    onSessionUpdated: (session: DebugSession) => void;
}

export function WorkbenchLayout({
                                    sessions,
                                    activeId,
                                    interactions,
                                    selection,
                                    actionTarget,
                                    session,
                                    selectedInteraction,
                                    selectedEvent,
                                    tools,
                                    upstreams,
                                    loading,
                                    onSelectSession,
                                    onDelete,
                                    onReplay,
                                    onReset,
                                    onSelect,
                                    onApplied,
                                    onSessionUpdated,
                                }: Props) {
    const { token } = theme.useToken();
    return (
        <div style={{ flex: 1, minHeight: 0 }}>
            <Splitter style={{ height: "100%" }}>
                <Splitter.Panel min={640}>
                    <Splitter orientation="vertical" style={{ height: "100%" }}>
                        <Splitter.Panel defaultSize="67%" min={360}>
                            <Splitter style={{ height: "100%" }}>
                                <Splitter.Panel
                                    defaultSize={288}
                                    min={220}
                                    max={420}
                                    collapsible
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            overflow: "auto",
                                            background: token.colorBgContainer,
                                        }}
                                    >
                                        <SessionList
                                            sessions={sessions}
                                            activeId={activeId}
                                            onSelect={onSelectSession}
                                            onDelete={onDelete}
                                            onReplay={onReplay}
                                            onReset={onReset}
                                        />
                                    </div>
                                </Splitter.Panel>
                                <Splitter.Panel min={420}>
                                    <div style={{ height: "100%", overflow: "auto" }}>
                                        <InteractionTimeline
                                            interactions={interactions}
                                            selection={selection}
                                            onSelect={onSelect}
                                            loading={loading}
                                        />
                                    </div>
                                </Splitter.Panel>
                            </Splitter>
                        </Splitter.Panel>
                        <Splitter.Panel min={240}>
                            <div
                                style={{
                                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                                    background: token.colorBgContainer,
                                    padding: "20px 24px 24px",
                                    overflow: "auto",
                                    height: "100%",
                                }}
                            >
                                <ActionPanel
                                    interaction={actionTarget}
                                    session={session}
                                    tools={tools}
                                    upstreams={upstreams}
                                    onApplied={onApplied}
                                    onSessionUpdated={onSessionUpdated}
                                />
                            </div>
                        </Splitter.Panel>
                    </Splitter>
                </Splitter.Panel>
                <Splitter.Panel defaultSize={480} min={340} max={760} collapsible>
                    <div
                        style={{
                            height: "100%",
                            overflow: "auto",
                            background: token.colorBgContainer,
                        }}
                    >
                        <Inspector
                            interaction={selectedInteraction}
                            event={selectedEvent}
                        />
                    </div>
                </Splitter.Panel>
            </Splitter>
        </div>
    );
}
