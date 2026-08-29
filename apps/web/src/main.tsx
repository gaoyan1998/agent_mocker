import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import dayjs from 'dayjs';
import { router } from './router';
import { useUiStore } from './stores/ui';
import { buildTheme } from './theme';
import type { Lang } from './i18n';
import './styles.css';

/** antd 与 dayjs 各有一套 locale 标识，集中在这里映射。 */
const ANTD_LOCALES = { zh: zhCN, en: enUS };
const DAYJS_LOCALES: Record<Lang, string> = { zh: 'zh-cn', en: 'en' };

function Root() {
  const mode = useUiStore((state) => state.theme);
  const lang = useUiStore((state) => state.lang);

  // dayjs 是全局单例，语言变了要跟着切，否则相对时间还是旧语言。
  dayjs.locale(DAYJS_LOCALES[lang]);

  return (
    <ConfigProvider locale={ANTD_LOCALES[lang]} theme={buildTheme(mode)}>
      {/* App 提供 message/modal 的上下文实例，避免用静态方法 */}
      <AntApp style={{ height: '100%' }}>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
