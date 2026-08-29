import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** URL 安全的短随机串（非加密用途，仅作 ID）。 */
export function shortId(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function id(prefix: string, length = 12): string {
  return `${prefix}_${shortId(length)}`;
}

export function newApiKey(): string {
  return `sk-mock-${shortId(24)}`;
}

export function newChatCompletionId(): string {
  return `chatcmpl-mock-${shortId(20)}`;
}

export function newToolCallId(): string {
  return `call_${shortId(20)}`;
}
