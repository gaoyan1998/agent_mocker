/**
 * Token 估算：Mock Server 不做真实分词，只给一个稳定可复现的近似值，
 * 让 Agent 侧的 usage 统计/成本计算代码有数据可用。
 * 规则：CJK 字符按 1 token，其余按 4 字符 1 token。
 */
export function estimateTokens(input: unknown): number {
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  if (!text) return 0;

  let cjk = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const isCjk =
      (code >= 0x3040 && code <= 0x30ff) || // 日文
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) || // 中日韩统一表意
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xac00 && code <= 0xd7af); // 韩文
    if (isCjk) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把字符串按固定长度切片，用于流式输出。 */
export function chunkString(text: string, size: number): string[] {
  if (!text) return [];
  const step = Math.max(1, size);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + step));
  }
  return chunks;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated ${text.length - max}]`;
}

/** OpenAI 的 message.content 可能是字符串或多模态数组，统一抽成纯文本。 */
export function messageContentToText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const record = part as Record<string, unknown>;
          if (typeof record.text === 'string') return record.text;
          if (typeof record.content === 'string') return record.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') return JSON.stringify(content);
  return String(content);
}

export function stringifyArguments(value: unknown): string {
  if (value == null) return '{}';
  if (typeof value === 'string') return value.trim() === '' ? '{}' : value;
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
