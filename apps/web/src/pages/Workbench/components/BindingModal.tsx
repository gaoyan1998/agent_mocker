import {
    describeAction,
    describeCondition,
    type Rule,
    type Scenario,
    type DebugSession,
} from "@agent-mock/shared";
import {
    Alert,
    Empty,
    Flex,
    List,
    Modal,
    Segmented,
    Space,
    Switch,
    Typography,
    theme,
} from "antd";
import { useLang, useT } from "@/i18n";

const { Text, Title } = Typography;
interface BindingModalProps {
    open: boolean;
    session: DebugSession | null;
    rules: Rule[];
    scenarios: Scenario[];
    type: "rule" | "scenario";
    focusedId: string | null;
    saving: boolean;
    onClose: () => void;
    onTypeChange: (type: "rule" | "scenario") => void;
    onFocus: (id: string) => void;
    onUpdate: (ruleIds: string[], scenarioIds: string[]) => void;
}

export function BindingModal({
                                 open,
                                 session,
                                 rules,
                                 scenarios,
                                 type,
                                 focusedId,
                                 saving,
                                 onClose,
                                 onTypeChange,
                                 onFocus,
                                 onUpdate,
                             }: BindingModalProps) {
    const t = useT();
    const lang = useLang();
    const { token } = theme.useToken();
    const items = type === "rule" ? rules : scenarios;
    const selectedRule = rules.find((item) => item.id === focusedId);
    const selectedScenario = scenarios.find((item) => item.id === focusedId);
    return (
        <Modal
            open={open}
            title={t('binding.title')}
            width={900}
            footer={null}
            destroyOnHidden
            onCancel={onClose}
        >
            <Flex vertical gap={12}>
                <Alert
                    type="info"
                    showIcon
                    message={t('binding.orderMessage')}
                    description={t('binding.orderDescription')}
                />
                <Segmented
                    block
                    value={type}
                    onChange={(value) => onTypeChange(value as "rule" | "scenario")}
                    options={[
                        {
                            label: t('binding.tabRules', { count: session?.ruleIds.length ?? 0 }),
                            value: "rule",
                        },
                        {
                            label: t('binding.tabScenarios', {
                                count: session?.scenarioIds.length ?? 0,
                            }),
                            value: "scenario",
                        },
                    ]}
                />
                <Flex gap={16} style={{ minHeight: 360 }}>
                    <div
                        style={{
                            width: 330,
                            borderRight: `1px solid ${token.colorBorderSecondary}`,
                            paddingRight: 12,
                        }}
                    >
                        <List<Rule | Scenario>
                            size="small"
                            dataSource={items}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={type === "rule" ? t('binding.emptyRules') : t('binding.emptyScenarios')}
                                    />
                                ),
                            }}
                            renderItem={(item) => {
                                const selected =
                                    type === "rule"
                                        ? (session?.ruleIds.includes(item.id) ?? false)
                                        : (session?.scenarioIds.includes(item.id) ?? false);
                                return (
                                    <List.Item
                                        onClick={() => onFocus(item.id)}
                                        style={{
                                            cursor: "pointer",
                                            paddingInline: 10,
                                            borderRadius: 6,
                                            background:
                                                focusedId === item.id
                                                    ? token.colorFillSecondary
                                                    : undefined,
                                        }}
                                        actions={[
                                            <Switch
                                                key="enabled"
                                                size="small"
                                                checked={selected}
                                                disabled={!item.enabled || saving}
                                                onClick={(_, event) => event?.stopPropagation()}
                                                onChange={(checked) => {
                                                    const ids =
                                                        type === "rule"
                                                            ? (session?.ruleIds ?? [])
                                                            : (session?.scenarioIds ?? []);
                                                    const next = checked
                                                        ? [...ids, item.id]
                                                        : ids.filter((id) => id !== item.id);
                                                    onUpdate(
                                                        type === "rule" ? next : (session?.ruleIds ?? []),
                                                        type === "scenario"
                                                            ? next
                                                            : (session?.scenarioIds ?? []),
                                                    );
                                                }}
                                            />,
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={item.name}
                                            description={!item.enabled ? t('binding.disabled') : undefined}
                                        />
                                    </List.Item>
                                );
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {type === "rule" && selectedRule ? (
                            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                                <Title level={5} style={{ margin: 0 }}>
                                    {selectedRule.name}
                                </Title>
                                {selectedRule.description && (
                                    <Text type="secondary">{selectedRule.description}</Text>
                                )}
                                <div>
                                    <Text strong>{t('binding.matchCondition')}</Text>
                                    <div style={{ marginTop: 6 }}>
                                        {describeCondition(selectedRule.condition, lang)}
                                    </div>
                                </div>
                                <div>
                                    <Text strong>{t('binding.action')}</Text>
                                    <div style={{ marginTop: 6 }}>
                                        {describeAction(selectedRule.action, lang)}
                                    </div>
                                </div>
                                <Text type="secondary">
                                    {t('binding.priorityHint', { priority: selectedRule.priority })}
                                </Text>
                            </Space>
                        ) : type === "scenario" && selectedScenario ? (
                            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                                <Title level={5} style={{ margin: 0 }}>
                                    {selectedScenario.name}
                                </Title>
                                {selectedScenario.description && (
                                    <Text type="secondary">{selectedScenario.description}</Text>
                                )}
                                <div>
                                    <Text strong>{t('binding.enterCondition')}</Text>
                                    <div style={{ marginTop: 6 }}>
                                        {describeCondition(selectedScenario.trigger, lang)}
                                    </div>
                                </div>
                                <div>
                                    <Text strong>{t('binding.steps', { count: selectedScenario.steps.length })}</Text>
                                    <List
                                        size="small"
                                        dataSource={selectedScenario.steps}
                                        renderItem={(step) => (
                                            <List.Item>
                                                <Text>
                                                    {step.sequence}.{" "}
                                                    {step.name || t('binding.stepN', { n: step.sequence })}
                                                </Text>
                                                <Text type="secondary">
                                                    {describeAction(step.action, lang)}
                                                </Text>
                                            </List.Item>
                                        )}
                                    />
                                </div>
                            </Space>
                        ) : (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={t('binding.pickOne')}
                            />
                        )}
                    </div>
                </Flex>
            </Flex>
        </Modal>
    );
}
