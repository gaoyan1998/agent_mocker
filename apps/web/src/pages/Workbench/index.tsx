import { App, Flex, Modal } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type {
    MockTool,
    Rule,
    Scenario,
    UpstreamConfig,
} from "@agent-mock/shared";
import { ruleApi, scenarioApi, toolApi } from "@/api/config";
import { ConnectSnippets } from "@/components/ConnectSnippets";
import { useProjectStore } from "@/stores/project";
import { useWorkbenchStore } from "@/stores/workbench";
import { useT } from "@/i18n";
import { BindingModal } from "./components/BindingModal";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import { WorkbenchToolbar } from "./components/WorkbenchToolbar";

export function WorkbenchPage() {
    const { projectId = "" } = useParams();
    const t = useT();
    const { message } = App.useApp();
    const store = useWorkbenchStore();
    const project = useProjectStore((state) => state.current);
    const [tools, setTools] = useState<MockTool[]>([]);
    const [rules, setRules] = useState<Rule[]>([]);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [savingBindings, setSavingBindings] = useState(false);
    const [bindingOpen, setBindingOpen] = useState(false);
    const [connectOpen, setConnectOpen] = useState(false);
    const [bindingType, setBindingType] = useState<"rule" | "scenario">("rule");
    const [focusedBindingId, setFocusedBindingId] = useState<string | null>(null);
    useEffect(() => {
        void store.bootstrap(projectId);
    }, [projectId]);
    useEffect(() => {
        void Promise.all([
            toolApi.list(projectId),
            ruleApi.list(projectId),
            scenarioApi.list(projectId),
        ])
            .then(([a, b, c]) => {
                setTools(a);
                setRules(b);
                setScenarios(c);
            })
            .catch(() => {
                setTools([]);
                setRules([]);
                setScenarios([]);
            });
    }, [projectId]);
    const session = useMemo(
        () => store.sessions.find((item) => item.id === store.sessionId) ?? null,
        [store.sessions, store.sessionId],
    );
    const selectedInteraction = useMemo(
        () =>
            store.interactions.find(
                (item) => item.id === store.selection.interactionId,
            ) ?? null,
        [store.interactions, store.selection.interactionId],
    );
    const selectedEvent = useMemo(
        () =>
            !store.selection.eventId || !selectedInteraction
                ? null
                : ((selectedInteraction.events ?? []).find(
                    (item) => item.id === store.selection.eventId,
                ) ?? null),
        [selectedInteraction, store.selection.eventId],
    );
    const actionTarget = useMemo(
        () =>
            selectedInteraction?.status === "waiting"
                ? selectedInteraction
                : (store.interactions.find((item) => item.status === "waiting") ??
                    selectedInteraction),
        [selectedInteraction, store.interactions],
    );
    const upstreams: UpstreamConfig[] = useMemo(() => project?.settings.upstreams.length
        ? project.settings.upstreams
        : project?.settings.upstreamEnabled && project.settings.upstreamBaseUrl
            ? [
                {
                    id: "legacy",
                    name: t('upstream.defaultName'),
                    enabled: true,
                    baseUrl: project.settings.upstreamBaseUrl,
                    apiKey: project.settings.upstreamApiKey,
                    model: project.settings.upstreamModel,
                },
            ]
            : [], [project]);
    const run = async (task: () => Promise<unknown>, successText?: string) => {
        try {
            await task();
            if (successText) message.success(successText);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };
    const updateBindings = async (ruleIds: string[], scenarioIds: string[]) => {
        setSavingBindings(true);
        try {
            await store.updateSessionBindings(ruleIds, scenarioIds);
            message.success(t('workbench.bindingsSaved'));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSavingBindings(false);
        }
    };
    const openBindings = () => {
        const firstId =
            bindingType === "rule"
                ? (session?.ruleIds[0] ?? rules[0]?.id)
                : (session?.scenarioIds[0] ?? scenarios[0]?.id);
        setFocusedBindingId(firstId ?? null);
        setBindingOpen(true);
    };
    const changeBindingType = (type: "rule" | "scenario") => {
        setBindingType(type);
        const firstId =
            type === "rule"
                ? (session?.ruleIds[0] ?? rules[0]?.id)
                : (session?.scenarioIds[0] ?? scenarios[0]?.id);
        setFocusedBindingId(firstId ?? null);
    };
    return (
        <Flex vertical style={{ height: "100%" }}>
            <WorkbenchToolbar
                session={session}
                bindingCount={
                    (session?.ruleIds.length ?? 0) + (session?.scenarioIds.length ?? 0)
                }
                onOpenBindings={openBindings}
                onOpenConnect={() => setConnectOpen(true)}
                onRefresh={() => void run(store.refreshInteractions)}
                onEnd={() =>
                    session && void run(() => store.endSession(session.id), t('workbench.sessionEnded'))
                }
                onReopen={() =>
                    session &&
                    void run(() => store.reopenSession(session.id), t('workbench.sessionReopened'))
                }
                onNew={() => void run(() => store.newSession(), t('workbench.sessionCreated'))}
            />
            <Modal
                open={connectOpen}
                title={t('workbench.connectTitle')}
                width={800}
                footer={null}
                destroyOnHidden
                onCancel={() => setConnectOpen(false)}
            >
                <ConnectSnippets
                    apiKey={project?.apiKey ?? ""}
                    mockBaseUrl={`${window.location.origin}/v1`}
                    sessionId={session?.externalId ?? undefined}
                />
            </Modal>
            <BindingModal
                open={bindingOpen}
                session={session}
                rules={rules}
                scenarios={scenarios}
                type={bindingType}
                focusedId={focusedBindingId}
                saving={savingBindings}
                onClose={() => setBindingOpen(false)}
                onTypeChange={changeBindingType}
                onFocus={setFocusedBindingId}
                onUpdate={(a, b) => void updateBindings(a, b)}
            />
            <WorkbenchLayout
                sessions={store.sessions}
                activeId={store.sessionId}
                interactions={store.interactions}
                selection={store.selection}
                actionTarget={actionTarget}
                session={session}
                selectedInteraction={selectedInteraction}
                selectedEvent={selectedEvent}
                tools={tools}
                upstreams={upstreams}
                loading={store.loadingInteractions}
                onSelectSession={(id) => void run(() => store.selectSession(id))}
                onDelete={(id) => void run(() => store.deleteSession(id), t('workbench.sessionDeleted'))}
                onReplay={(id) =>
                    void run(
                        () => store.replaySession(id),
                        t('workbench.replayCreated'),
                    )
                }
                onReset={(id) =>
                    void run(
                        () => store.resetSession(id),
                        t('workbench.replayReset'),
                    )
                }
                onSelect={store.select}
                onApplied={() => void store.refreshInteractions()}
                onSessionUpdated={(updated) => store.setSession(updated)}
            />
        </Flex>
    );
}
