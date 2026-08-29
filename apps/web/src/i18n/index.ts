import { useUiStore } from '../stores/ui';
import { en } from './locales/en';
import { zh } from './locales/zh';
import type { Dict, Lang } from './types';

export type { Lang } from './types';
export { LANGS, LANG_LABELS } from './types';

const DICTS: Record<Lang, Dict> = { zh, en };

/** 文案里的占位符写成 {name}，t() 的第二个参数按名字替换。 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}

export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  // 缺 key 时回落到中文，再回落到 key 本身，保证界面不会出现空白。
  const text = DICTS[lang]?.[key] ?? zh[key] ?? key;
  return interpolate(text, params);
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * 组件里取翻译函数。语言变化时会触发重渲染。
 * 非组件代码（store / util）用 t()。
 */
export function useT(): TFunction {
  const lang = useUiStore((state) => state.lang);
  return (key, params) => translate(lang, key, params);
}

export function useLang(): Lang {
  return useUiStore((state) => state.lang);
}

/** 组件外用的翻译函数，直接读 store 当前语言。 */
export const t: TFunction = (key, params) =>
  translate(useUiStore.getState().lang, key, params);
