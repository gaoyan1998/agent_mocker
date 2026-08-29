import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

/**
 * 全局视觉基调：整体「宽松」优先。
 *
 * 之前每个页面都靠 size="small" + 8px padding 拼出来，控件又矮又挤，
 * 所以这里把尺寸刻度统一抬一档，页面里就不需要再各自堆细节样式了：
 *
 * - sizeStep 4 → 5：padding/margin 全系列跟着放大（padding 16 → 20，
 *   paddingSM 12 → 16，paddingXS 8 → 12，marginLG 24 → 28）。
 * - controlHeight 32 → 36：输入框、按钮、Select 不再显得瘦。
 * - 组件级 token 再补几处 antd 默认给得偏紧的地方（表格单元格、Card、Menu、表单项间距）。
 */
const SPACIOUS_TOKEN = {
  sizeUnit: 4,
  sizeStep: 5,

  controlHeight: 36,
  controlHeightSM: 28,
  controlHeightLG: 44,
  controlPaddingHorizontal: 14,
  controlPaddingHorizontalSM: 10,

  borderRadius: 8,
  borderRadiusSM: 6,
  borderRadiusLG: 12,

  fontSize: 14,
  fontSizeSM: 13,
  lineHeight: 1.6,
} as const;

const SPACIOUS_COMPONENTS: ThemeConfig['components'] = {
  Layout: {
    headerHeight: 60,
    headerPadding: '0 24px',
  },
  Menu: {
    itemHeight: 44,
    itemMarginBlock: 6,
    itemMarginInline: 12,
    itemPaddingInline: 14,
    iconMarginInlineEnd: 12,
    iconSize: 16,
  },
  Card: {
    bodyPadding: 24,
    headerPadding: 24,
    headerHeight: 60,
    headerFontSize: 16,
    bodyPaddingSM: 20,
    headerPaddingSM: 20,
    headerHeightSM: 48,
  },
  Table: {
    cellPaddingBlock: 14,
    cellPaddingInline: 16,
    cellPaddingBlockMD: 14,
    cellPaddingInlineMD: 16,
    cellPaddingBlockSM: 12,
    cellPaddingInlineSM: 14,
  },
  Form: {
    itemMarginBottom: 24,
    verticalLabelPadding: '0 0 8px',
    labelFontSize: 14,
  },
  Tabs: {
    horizontalItemGutter: 28,
    horizontalItemPadding: '12px 2px',
    titleFontSize: 14,
  },
  Descriptions: {
    itemPaddingBottom: 14,
  },
  Alert: {
    defaultPadding: '12px 16px',
    withDescriptionPadding: 20,
  },
  Segmented: {
    trackPadding: 4,
  },
  Drawer: {
    footerPaddingBlock: 16,
    footerPaddingInline: 24,
  },
  Modal: {
    titleFontSize: 17,
  },
  List: {
    itemPadding: '16px 20px',
  },
  Statistic: {
    titleFontSize: 13,
  },
};

export function buildTheme(mode: 'light' | 'dark'): ThemeConfig {
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: SPACIOUS_TOKEN,
    components: SPACIOUS_COMPONENTS,
  };
}

/** 页面级留白，横向比纵向再多一点，避免内容贴着侧边栏。 */
export const PAGE_PADDING = { block: 28, inline: 32 } as const;
