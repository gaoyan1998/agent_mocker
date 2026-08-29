import type { MockTool } from '@agent-mock/shared';
import { resolvePath } from '../engine/rule-engine.js';
import { shortId } from '../lib/id.js';
import { tryParseJson } from '../lib/text.js';
import { advanceToolCursor, findToolByName } from '../repositories/tools.js';

export interface ResolvedToolResponse {
  result: unknown;
  delayMs: number;
  isError: boolean;
  /** 命中的 Tool 配置；未配置该 tool 时为 null。 */
  tool: MockTool | null;
}

/**
 * Tool Response 模式：static / template / random / sequence / error。
 * 供两处使用：
 *  1. Rule / 人工的 tool_result 动作（不填 result 时自动取 mock 配置）；
 *  2. /v1/tools/:name 直接给 Agent 当假 Tool 用。
 */
export function resolveToolResponse(
  projectId: string,
  toolName: string,
  args: unknown = {},
): ResolvedToolResponse {
  const tool = findToolByName(projectId, toolName);
  if (!tool) {
    return {
      result: { error: `Tool "${toolName}" 未在项目中配置`, code: 'tool_not_configured' },
      delayMs: 0,
      isError: true,
      tool: null,
    };
  }

  const base = { delayMs: tool.delayMs, tool, isError: false };

  switch (tool.responseMode) {
    case 'error':
      return {
        ...base,
        isError: true,
        result: { error: tool.errorMessage || `Tool "${toolName}" 执行失败` },
      };

    case 'random': {
      const pool = tool.responses.length > 0 ? tool.responses : [tool.response];
      const picked = pool[Math.floor(Math.random() * pool.length)];
      return { ...base, result: picked ?? null };
    }

    case 'sequence': {
      const pool = tool.responses.length > 0 ? tool.responses : [tool.response];
      const picked = pool[tool.cursor % pool.length];
      advanceToolCursor(tool.id);
      return { ...base, result: picked ?? null };
    }

    case 'template':
      return { ...base, result: renderTemplate(tool.response, args) };

    case 'static':
    default:
      return { ...base, result: tool.response ?? null };
  }
}

/**
 * 模板渲染：把 response 里的 `{{path}}` 用调用参数填充。
 * 额外内置 `{{$now}}`（ISO 时间）与 `{{$id}}`（随机短 ID）。
 */
export function renderTemplate(template: unknown, args: unknown): unknown {
  if (template == null) return null;
  const text = typeof template === 'string' ? template : JSON.stringify(template);
  const rendered = text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_match, expression: string) => {
    if (expression === '$now') return new Date().toISOString();
    if (expression === '$id') return shortId(8);
    const values = resolvePath(args, expression);
    if (values.length === 0) return '';
    const value = values[0];
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
  return typeof template === 'string' ? rendered : tryParseJson(rendered);
}
