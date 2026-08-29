import { Space, Typography } from 'antd';
import type { Interaction } from '@agent-mock/shared';
import { JsonBlock } from '@/components/JsonBlock';

const { Text } = Typography;

/** 请求：原始 Headers + Body。 */
export function RequestTab({ interaction }: { interaction: Interaction }) {
  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      <Text type="secondary">Headers</Text>
      <JsonBlock value={interaction.requestHeaders} maxHeight={180} />
      <Text type="secondary" style={{ marginTop: 12 }}>
        Body
      </Text>
      <JsonBlock value={interaction.request} maxHeight="calc(100vh - 520px)" />
    </Space>
  );
}
