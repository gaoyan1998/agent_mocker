import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '../i18n/types';

export type ThemeMode = 'light' | 'dark';

/** 首次进入时按浏览器语言猜一个，之后以用户显式选择为准（persist 会覆盖）。 */
function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'zh';
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

interface UiState {
  theme: ThemeMode;
  lang: Lang;
  toggleTheme: () => void;
  setLang: (lang: Lang) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      lang: detectLang(),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setLang: (lang) => set({ lang }),
    }),
    { name: 'agent-mock-ui' },
  ),
);
