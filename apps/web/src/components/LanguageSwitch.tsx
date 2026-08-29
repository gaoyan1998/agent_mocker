import { TranslationOutlined } from '@ant-design/icons';
import { Dropdown, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { Button } from 'antd';
import { useUiStore } from '../stores/ui';
import { LANGS, LANG_LABELS, useT } from '../i18n';

/** 顶栏里的语言切换：和主题切换按钮同一个视觉规格。 */
export function LanguageSwitch(props: Pick<ButtonProps, 'type' | 'size' | 'variant'>) {
  const t = useT();
  const lang = useUiStore((state) => state.lang);
  const setLang = useUiStore((state) => state.setLang);

  return (
    <Dropdown
      menu={{
        selectable: true,
        selectedKeys: [lang],
        items: LANGS.map((item) => ({ key: item, label: LANG_LABELS[item] })),
        onClick: ({ key }) => setLang(key as typeof lang),
      }}
    >
      <Tooltip title={t('common.language')}>
        <Button {...props} icon={<TranslationOutlined />} aria-label={t('common.language')} />
      </Tooltip>
    </Dropdown>
  );
}
