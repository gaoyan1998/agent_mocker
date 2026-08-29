import { ApiOutlined, BulbFilled, BulbOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Divider, Layout, Space, Tooltip, Typography, theme } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '../stores/ui';

const { Header, Content } = Layout;
const { Text } = Typography;

const HEADER_HEIGHT = 60;

/** 全局外壳：顶栏 + 内容区。项目内的侧边导航在 ProjectLayout 里。 */
export function RootLayout() {

  return (
    <Layout style={{ height: '100%' }}>

      <Content style={{ height: `calc(100% - ${HEADER_HEIGHT}px)`, overflow: 'hidden' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
