import type { InteractionEvent } from '@agent-mock/shared';

/** 时间线上每个事件右侧那行灰色摘要。 */
export function summarizeEvent(event: InteractionEvent): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'request': {
      const count = payload.messageCount ?? 0;
      const tools = Array.isArray(payload.tools) ? payload.tools : [];
      const preview = previewMessages(payload.newMessages);
      return `${count} 条消息${tools.length > 0 ? ` · ${tools.length} 个 tool` : ''}${preview ? ` · ${preview}` : ''}`;
    }
    case 'decision':
      return String(payload.reason ?? payload.mode ?? '');
    case 'think':
      return clip(String(payload.content ?? ''));
    case 'tool_call': {
      const calls = Array.isArray(payload.toolCalls) ? payload.toolCalls : [];
      return calls
        .map((call) => {
          const item = call as { name?: string; arguments?: string };
          return `${item.name ?? '?'}(${clip(item.arguments ?? '', 48)})`;
        })
        .join(', ');
    }
    case 'tool_result':
      return `${String(payload.tool ?? '')} → ${clip(stringify(payload.result), 64)}${
        payload.source === 'agent' ? ' （Agent 回传）' : ''
      }`;
    case 'assistant':
      return clip(String(payload.content ?? ''));
    case 'delay':
      return `等待 ${String(payload.ms ?? 0)}ms`;
    case 'error':
      return `${String(payload.status ?? '')} ${String(payload.message ?? '')}`;
    default:
      return '';
  }
}

function previewMessages(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const last = value[value.length - 1] as { role?: string; content?: unknown };
  const content = typeof last.content === 'string' ? last.content : stringify(last.content);
  return `${last.role ?? '?'}: ${clip(content, 60)}`;
}

function stringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clip(text: string, max = 80): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length <= max ? single : `${single.slice(0, max)}…`;
}
