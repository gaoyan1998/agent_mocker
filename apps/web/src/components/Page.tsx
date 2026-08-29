import { Flex, Space, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { PAGE_PADDING } from '../theme';

const { Title, Text } = Typography;

interface PageProps {
  children: ReactNode;
  /** 内容之间的纵向间距，默认 24。 */
  gap?: number;
  style?: CSSProperties;
}

/**
 * 统一的页面容器：固定的大留白 + 纵向 flex 间距。
 * 各页面不再自己写 padding，避免出现「有的 16 有的 24」的拼凑感。
 */
export function Page({ children, gap = 24, style }: PageProps) {
  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: `${PAGE_PADDING.block}px ${PAGE_PADDING.inline}px`,
        display: 'flex',
        flexDirection: 'column',
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 右侧操作区；多个按钮之间自动留 12px，不会再贴在一起。 */
  extra?: ReactNode;
}

export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <Flex align="flex-start" justify="space-between" gap={24} wrap>
      <Space orientation="vertical" size={6}>
        <Title level={4} style={{ margin: 0, lineHeight: 1.3 }}>
          {title}
        </Title>
        {description && <Text type="secondary">{description}</Text>}
      </Space>
      {extra && (
        <Space size={12} wrap>
          {extra}
        </Space>
      )}
    </Flex>
  );
}

interface SectionTitleProps {
  children: ReactNode;
  extra?: ReactNode;
}

/** 卡片/抽屉内部的小节标题。 */
export function SectionTitle({ children, extra }: SectionTitleProps) {
  return (
    <Flex align="center" justify="space-between" gap={16} style={{ marginBottom: 12 }}>
      <Text strong style={{ fontSize: 15 }}>
        {children}
      </Text>
      {extra}
    </Flex>
  );
}
