import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Flex,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import { useMemo } from 'react';
import {
  COMPARE_OPS,
  CONDITION_TARGETS,
  type CompareOp,
  type RuleCondition,
} from '@agent-mock/shared';
import { useT } from '../../i18n';

const { Text } = Typography;

/** 编辑器里支持的「叶子条件」类型；嵌套 not/all/any 请用 JSON 模式。 */
type LeafType =
  | 'always'
  | 'contains'
  | 'equals'
  | 'regex'
  | 'model'
  | 'tool'
  | 'message_count'
  | 'sequence_index'
  | 'jsonpath';

const LEAF_LABEL_KEYS: Record<LeafType, string> = {
  always: 'condition.type.always',
  contains: 'condition.type.contains',
  equals: 'condition.type.equals',
  regex: 'condition.type.regex',
  model: 'condition.type.model',
  tool: 'condition.type.tool',
  message_count: 'condition.type.message_count',
  sequence_index: 'condition.type.sequence_index',
  jsonpath: 'JSONPath',
};

const TARGET_LABEL_KEYS: Record<string, string> = {
  last_user_message: 'condition.target.last_user_message',
  last_message: 'condition.target.last_message',
  all_messages: 'condition.target.all_messages',
  system_prompt: 'System Prompt',
  raw_request: 'condition.target.raw_request',
};

/** 数学符号不用翻译，只有三个词形的算子走字典。 */
const OP_LABELS: Record<CompareOp, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'condition.op.contains',
  regex: 'condition.op.regex',
  exists: 'condition.op.exists',
};

export interface ConditionEditorProps {
  value: RuleCondition;
  onChange: (value: RuleCondition) => void;
  jsonMode: boolean;
  onJsonModeChange: (jsonMode: boolean) => void;
}

function toClauses(value: RuleCondition): { mode: 'all' | 'any'; clauses: RuleCondition[] } {
  if (value.type === 'all' || value.type === 'any') {
    return {
      mode: value.type,
      clauses: value.conditions.length > 0 ? value.conditions : [{ type: 'always' }],
    };
  }
  return { mode: 'all', clauses: [value] };
}

function fromClauses(mode: 'all' | 'any', clauses: RuleCondition[]): RuleCondition {
  if (clauses.length === 0) return { type: 'always' };
  if (clauses.length === 1) return clauses[0]!;
  return { type: mode, conditions: clauses };
}

/** Rule 条件编辑器。 */
export function ConditionEditor({
  value,
  onChange,
  jsonMode,
  onJsonModeChange,
}: ConditionEditorProps) {
  const t = useT();
  const { mode, clauses } = useMemo(() => toClauses(value), [value]);
  const editable = clauses.every((clause) => clause.type in LEAF_LABEL_KEYS);

  const update = (index: number, clause: RuleCondition) => {
    const next = clauses.map((item, position) => (position === index ? clause : item));
    onChange(fromClauses(mode, next));
  };

  if (jsonMode || !editable) {
    return (
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <JsonModeToggle jsonMode onChange={onJsonModeChange} forced={!editable} />
        <Input.TextArea
          value={JSON.stringify(value, null, 2)}
          autoSize={{ minRows: 6, maxRows: 16 }}
          className="mock-mono"
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value) as RuleCondition);
            } catch {
              // 输入过程中的非法 JSON 先忽略，等用户输完再生效。
            }
          }}
        />
      </Space>
    );
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={16}>
      <Flex align="center" gap={24} wrap>
        <Segmented
          value={mode}
          onChange={(next) => onChange(fromClauses(next as 'all' | 'any', clauses))}
          options={[
            { label: t('condition.matchAll'), value: 'all' },
            { label: t('condition.matchAny'), value: 'any' },
          ]}
          disabled={clauses.length < 2}
        />
        <JsonModeToggle jsonMode={false} onChange={onJsonModeChange} />
      </Flex>

      {clauses.map((clause, index) => (
        <Card key={index} variant="outlined" styles={{ body: { padding: 16 } }}>
          <Flex gap={12} align="center" wrap>
            <Select
              style={{ width: 170 }}
              value={clause.type}
              onChange={(type) => update(index, defaultClause(type as LeafType))}
              options={(Object.keys(LEAF_LABEL_KEYS) as LeafType[]).map((type) => ({
                value: type,
                label: t(LEAF_LABEL_KEYS[type]),
              }))}
            />
            <ClauseFields clause={clause} onChange={(next) => update(index, next)} />
            {clauses.length > 1 && (
              <Tooltip title={t('condition.deleteClause')}>
                <Button
                  variant="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    onChange(
                      fromClauses(
                        mode,
                        clauses.filter((_, position) => position !== index),
                      ),
                    )
                  }
                />
              </Tooltip>
            )}
          </Flex>
        </Card>
      ))}

      <Button
        block
        variant="dashed"
        icon={<PlusOutlined />}
        onClick={() => onChange(fromClauses(mode, [...clauses, { type: 'contains', value: '' }]))}
      >
        {t('condition.addClause')}
      </Button>
    </Space>
  );
}

function JsonModeToggle({
  jsonMode,
  onChange,
  forced,
}: {
  jsonMode: boolean;
  onChange: (value: boolean) => void;
  forced?: boolean;
}) {
  const t = useT();
  return (
    <Space size={10}>
      <Switch checked={jsonMode} onChange={onChange} disabled={forced} />
      <Text type="secondary">
        {forced ? t('condition.jsonModeNested') : t('common.jsonMode')}
      </Text>
    </Space>
  );
}

function defaultClause(type: LeafType): RuleCondition {
  switch (type) {
    case 'always':
      return { type: 'always' };
    case 'contains':
      return { type: 'contains', value: '', target: 'last_user_message' };
    case 'equals':
      return { type: 'equals', value: '', target: 'last_user_message' };
    case 'regex':
      return { type: 'regex', value: '', target: 'last_user_message' };
    case 'model':
      return { type: 'model', value: '' };
    case 'tool':
      return { type: 'tool', value: '' };
    case 'message_count':
      return { type: 'message_count', op: 'gte', value: 1 };
    case 'sequence_index':
      return { type: 'sequence_index', op: 'eq', value: 1 };
    case 'jsonpath':
    default:
      return { type: 'jsonpath', path: 'messages[0].role', op: 'eq', value: 'user' };
  }
}

function ClauseFields({
  clause,
  onChange,
}: {
  clause: RuleCondition;
  onChange: (value: RuleCondition) => void;
}) {
  const t = useT();
  switch (clause.type) {
    case 'always':
      return (
        <Text type="secondary" style={{ flex: 1, minWidth: 240 }}>
          {t('condition.alwaysHint')}
        </Text>
      );

    case 'contains':
    case 'equals':
    case 'regex':
      return (
        <>
          <Select
            style={{ width: 190 }}
            value={clause.target ?? 'last_user_message'}
            onChange={(target) => onChange({ ...clause, target })}
            options={CONDITION_TARGETS.map((target) => ({
              value: target,
              label: TARGET_LABEL_KEYS[target] ? t(TARGET_LABEL_KEYS[target]) : target,
            }))}
          />
          <Input
            style={{ flex: 1, minWidth: 200 }}
            value={clause.value}
            placeholder={
              clause.type === 'regex'
                ? t('condition.regexPlaceholder')
                : t('condition.valuePlaceholder')
            }
            onChange={(event) => onChange({ ...clause, value: event.target.value })}
          />
          {clause.type !== 'regex' && (
            <Space size={10}>
              <Switch
                checked={clause.ignoreCase ?? false}
                onChange={(ignoreCase) => onChange({ ...clause, ignoreCase })}
              />
              <Text type="secondary">{t('condition.ignoreCase')}</Text>
            </Space>
          )}
        </>
      );

    case 'model':
    case 'tool':
      return (
        <Input
          style={{ flex: 1, minWidth: 200 }}
          value={clause.value}
          placeholder={clause.type === 'model' ? 'gpt-4o' : 'get_order'}
          onChange={(event) => onChange({ ...clause, value: event.target.value })}
        />
      );

    case 'message_count':
    case 'sequence_index':
      return (
        <>
          <Select
            style={{ width: 110 }}
            value={clause.op}
            onChange={(op) => onChange({ ...clause, op })}
            options={COMPARE_OPS.filter(
              (op) => op !== 'exists' && op !== 'regex' && op !== 'contains',
            ).map((op) => ({ value: op, label: t(OP_LABELS[op]) }))}
          />
          <InputNumber
            style={{ width: 130 }}
            value={clause.value}
            onChange={(next) => onChange({ ...clause, value: next ?? 0 })}
          />
        </>
      );

    case 'jsonpath':
      return (
        <>
          <Input
            style={{ width: 220 }}
            value={clause.path}
            placeholder="messages[*].role"
            className="mock-mono"
            onChange={(event) => onChange({ ...clause, path: event.target.value })}
          />
          <Select
            style={{ width: 110 }}
            value={clause.op}
            onChange={(op) => onChange({ ...clause, op })}
            options={COMPARE_OPS.map((op) => ({ value: op, label: t(OP_LABELS[op]) }))}
          />
          {clause.op !== 'exists' && (
            <Input
              style={{ flex: 1, minWidth: 160 }}
              value={String(clause.value ?? '')}
              placeholder={t('condition.expectedValue')}
              onChange={(event) => onChange({ ...clause, value: event.target.value })}
            />
          )}
        </>
      );

    default:
      return null;
  }
}
