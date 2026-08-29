import { ArrowDownOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  AutoComplete,
  Button,
  Card,
  Flex,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useMemo } from 'react';
import {
  ERROR_PRESETS,
  FINISH_REASONS,
  type MockAction,
  type MockActionType,
  type MockTool,
} from '@agent-mock/shared';
import { useT } from '../../i18n';

const { Text } = Typography;

const ACTION_LABEL_KEYS: Record<MockActionType, string> = {
  assistant: 'action.type.assistant',
  think: 'action.type.think',
  tool_call: 'Tool Call',
  tool_result: 'action.type.tool_result',
  delay: 'action.type.delay',
  error: 'action.type.error',
  timeout: 'action.type.timeout',
  manual: 'action.type.manual',
  sequence: 'action.type.sequence',
};

export interface ActionEditorProps {
  value: MockAction;
  onChange: (value: MockAction) => void;
  tools: MockTool[];
  jsonMode: boolean;
  onJsonModeChange: (jsonMode: boolean) => void;
}

function toSteps(value: MockAction): MockAction[] {
  if (value.type === 'sequence') {
    return value.actions.length > 0 ? value.actions : [{ type: 'assistant', content: '' }];
  }
  return [value];
}

function fromSteps(steps: MockAction[]): MockAction {
  if (steps.length === 0) return { type: 'assistant', content: '' };
  if (steps.length === 1) return steps[0]!;
  return { type: 'sequence', actions: steps };
}

/**
 * Action 编辑器。
 * 多个步骤会被包成 sequence —— 例如「Think → Tool Call」或「Delay → Reply」。
 */
export function ActionEditor({
  value,
  onChange,
  tools,
  jsonMode,
  onJsonModeChange,
}: ActionEditorProps) {
  const t = useT();
  const { token } = theme.useToken();
  const steps = useMemo(() => toSteps(value), [value]);
  const hasNestedSequence = steps.some((step) => step.type === 'sequence');

  const update = (index: number, step: MockAction) => {
    onChange(fromSteps(steps.map((item, position) => (position === index ? step : item))));
  };

  if (jsonMode || hasNestedSequence) {
    return (
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Space size={10}>
          <Switch checked onChange={onJsonModeChange} disabled={hasNestedSequence} />
          <Text type="secondary">
            {hasNestedSequence ? t('action.jsonModeNested') : t('common.jsonMode')}
          </Text>
        </Space>
        <Input.TextArea
          value={JSON.stringify(value, null, 2)}
          autoSize={{ minRows: 8, maxRows: 20 }}
          className="mock-mono"
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value) as MockAction);
            } catch {
              // 忽略输入中间态。
            }
          }}
        />
      </Space>
    );
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={16}>
      <Space size={10}>
        <Switch checked={false} onChange={onJsonModeChange} />
        <Text type="secondary">{t('common.jsonMode')}</Text>
      </Space>

      {steps.map((step, index) => (
        <div key={index}>
          {index > 0 && (
            <div
              style={{
                textAlign: 'center',
                color: token.colorTextTertiary,
                padding: '4px 0 12px',
              }}
            >
              <ArrowDownOutlined />
            </div>
          )}
          <Card variant="outlined" styles={{ body: { padding: 16 } }}>
            <Flex gap={12} align="flex-start" wrap>
              <Select
                style={{ width: 190 }}
                value={step.type}
                onChange={(type) => update(index, defaultAction(type as MockActionType))}
                options={(Object.keys(ACTION_LABEL_KEYS) as MockActionType[])
                  .filter((type) => type !== 'sequence')
                  .map((type) => ({ value: type, label: t(ACTION_LABEL_KEYS[type]) }))}
              />
              <div style={{ flex: 1, minWidth: 260 }}>
                <StepFields step={step} tools={tools} onChange={(next) => update(index, next)} />
              </div>
              {steps.length > 1 && (
                <Tooltip title={t('common.deleteThisStep')}>
                  <Button
                    variant="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      onChange(fromSteps(steps.filter((_, position) => position !== index)))
                    }
                  />
                </Tooltip>
              )}
            </Flex>
          </Card>
        </div>
      ))}

      <Button
        block
        variant="dashed"
        icon={<PlusOutlined />}
        onClick={() => onChange(fromSteps([...steps, { type: 'assistant', content: '' }]))}
      >
        {t('common.addStep')}
      </Button>
    </Space>
  );
}

export function defaultAction(type: MockActionType): MockAction {
  switch (type) {
    case 'think':
      return { type: 'think', content: '' };
    case 'tool_call':
      return { type: 'tool_call', toolCalls: [{ name: '', arguments: {} }] };
    case 'tool_result':
      return { type: 'tool_result', tool: '' };
    case 'delay':
      return { type: 'delay', ms: 500 };
    case 'error':
      return {
        type: 'error',
        status: 429,
        message: 'Rate limit exceeded',
        errorType: 'rate_limit_error',
        code: 'rate_limit',
      };
    case 'timeout':
      return { type: 'timeout' };
    case 'manual':
      return { type: 'manual' };
    case 'sequence':
      return { type: 'sequence', actions: [{ type: 'assistant', content: '' }] };
    case 'assistant':
    default:
      return { type: 'assistant', content: '' };
  }
}

function StepFields({
  step,
  tools,
  onChange,
}: {
  step: MockAction;
  tools: MockTool[];
  onChange: (value: MockAction) => void;
}) {
  const t = useT();
  const toolOptions = tools.map((tool) => ({ value: tool.name, label: tool.name }));

  switch (step.type) {
    case 'assistant':
      return (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Input.TextArea
            value={step.content}
            placeholder={t('action.assistantPlaceholder')}
            autoSize={{ minRows: 3, maxRows: 8 }}
            onChange={(event) => onChange({ ...step, content: event.target.value })}
          />
          <Select
            style={{ width: 210 }}
            value={step.finishReason ?? 'stop'}
            onChange={(finishReason) => onChange({ ...step, finishReason })}
            options={FINISH_REASONS.map((reason) => ({
              value: reason,
              label: `finish_reason: ${reason}`,
            }))}
          />
        </Space>
      );

    case 'think':
      return (
        <Input.TextArea
          value={step.content}
          placeholder={t('action.thinkPlaceholder')}
          autoSize={{ minRows: 3, maxRows: 8 }}
          onChange={(event) => onChange({ ...step, content: event.target.value })}
        />
      );

    case 'tool_call': {
      const call = step.toolCalls[0] ?? { name: '', arguments: {} };
      const argumentsText =
        typeof call.arguments === 'string'
          ? call.arguments
          : JSON.stringify(call.arguments ?? {}, null, 2);
      return (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <AutoComplete
            style={{ width: '100%' }}
            value={call.name}
            options={toolOptions}
            placeholder={t('action.toolNamePlaceholderExample')}
            onChange={(name) => onChange({ ...step, toolCalls: [{ ...call, name }] })}
          />
          <Input.TextArea
            value={argumentsText}
            placeholder='{"order_id": "123456"}'
            autoSize={{ minRows: 3, maxRows: 10 }}
            className="mock-mono"
            onChange={(event) => {
              const text = event.target.value;
              let parsed: string | Record<string, unknown> = text;
              try {
                parsed = JSON.parse(text) as Record<string, unknown>;
              } catch {
                parsed = text;
              }
              onChange({ ...step, toolCalls: [{ ...call, arguments: parsed }] });
            }}
          />
          <Text type="secondary">{t('action.multiToolCallHint')}</Text>
        </Space>
      );
    }

    case 'tool_result': {
      const useConfig = step.result === undefined;
      return (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Flex gap={20} align="center" wrap>
            <AutoComplete
              style={{ width: 220 }}
              value={step.tool}
              options={toolOptions}
              placeholder={t('action.toolNamePlaceholder')}
              onChange={(tool) => onChange({ ...step, tool })}
            />
            <Space size={10}>
              <Switch
                checked={useConfig}
                onChange={(checked) =>
                  onChange(
                    checked
                      ? { type: 'tool_result', tool: step.tool }
                      : { type: 'tool_result', tool: step.tool, result: {} },
                  )
                }
              />
              <Text>{t('action.useToolConfigured')}</Text>
            </Space>
          </Flex>
          {!useConfig && (
            <Input.TextArea
              value={JSON.stringify(step.result ?? {}, null, 2)}
              autoSize={{ minRows: 3, maxRows: 10 }}
              className="mock-mono"
              onChange={(event) => {
                try {
                  onChange({ ...step, result: JSON.parse(event.target.value) });
                } catch {
                  onChange({ ...step, result: event.target.value });
                }
              }}
            />
          )}
        </Space>
      );
    }

    case 'delay':
      return (
        <InputNumber
          min={0}
          max={600_000}
          step={100}
          value={step.ms}
          addonAfter="ms"
          style={{ width: 200 }}
          onChange={(ms) => onChange({ ...step, ms: ms ?? 0 })}
        />
      );

    case 'error':
      return (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Flex gap={12} wrap>
            <Select
              style={{ width: 230 }}
              value={step.status}
              onChange={(status) => {
                const preset = ERROR_PRESETS.find((item) => item.status === status);
                onChange({
                  type: 'error',
                  status,
                  message: preset?.message ?? step.message,
                  errorType: preset?.errorType ?? step.errorType,
                  code: preset?.code ?? step.code ?? null,
                });
              }}
              options={ERROR_PRESETS.map((preset) => ({
                value: preset.status,
                label: preset.label,
              }))}
            />
            <Input
              style={{ width: 200 }}
              value={step.errorType ?? ''}
              addonBefore="type"
              onChange={(event) => onChange({ ...step, errorType: event.target.value })}
            />
            <Input
              style={{ width: 200 }}
              value={step.code ?? ''}
              addonBefore="code"
              onChange={(event) => onChange({ ...step, code: event.target.value || null })}
            />
          </Flex>
          <Input.TextArea
            value={step.message}
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(event) => onChange({ ...step, message: event.target.value })}
          />
        </Space>
      );

    case 'timeout':
      return <Text type="secondary">{t('action.timeoutHint')}</Text>;

    case 'manual':
      return (
        <Text type="secondary">{t('action.manualHint')}</Text>
      );

    default:
      return null;
  }
}
