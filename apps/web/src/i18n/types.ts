/** 支持的界面语言。新增语种时在这里加一项，并补一份 locales/<lang>.ts。 */
export type Lang = 'zh' | 'en';

export const LANGS: Lang[] = ['zh', 'en'];

/** 语言切换器里显示的名字，用各语言自己的写法。 */
export const LANG_LABELS: Record<Lang, string> = {
  zh: '中文',
  en: 'English',
};

/** 字典是「扁平 key → 文案」。zh 是基准，其它语言必须给出同样的 key。 */
export type Dict = Record<string, string>;
