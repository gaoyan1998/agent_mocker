import { Splitter, theme } from 'antd';
import type { ReactNode } from 'react';

interface WorkbenchLayoutProps {
  sessions: ReactNode;
  timeline: ReactNode;
  actions: ReactNode;
  inspector: ReactNode;
}

/**
 * 工作台骨架：
 *
 *   ┌──────────┬────────────────┬───────────┐
 *   │ Sessions │ Timeline       │ Inspector │
 *   ├──────────┴────────────────┤           │
 *   │ Action Panel              │           │
 *   └───────────────────────────┴───────────┘
 *
 * 这里只负责分栏尺寸和边框，不认识任何业务数据 —— 四个区域由调用方以插槽传入。
 */
export function WorkbenchLayout({
  sessions,
  timeline,
  actions,
  inspector,
}: WorkbenchLayoutProps) {
  const { token } = theme.useToken();

  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      <Splitter style={{ height: '100%' }}>
        <Splitter.Panel min={640}>
          <Splitter orientation="vertical" style={{ height: '100%' }}>
            <Splitter.Panel defaultSize="67%" min={360}>
              <Splitter style={{ height: '100%' }}>
                <Splitter.Panel defaultSize={288} min={220} max={420} collapsible>
                  <div
                    style={{
                      height: '100%',
                      overflow: 'auto',
                      background: token.colorBgContainer,
                    }}
                  >
                    {sessions}
                  </div>
                </Splitter.Panel>
                <Splitter.Panel min={420}>
                  <div style={{ height: '100%', overflow: 'auto' }}>{timeline}</div>
                </Splitter.Panel>
              </Splitter>
            </Splitter.Panel>
            <Splitter.Panel min={240}>
              <div
                style={{
                  borderTop: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  padding: '20px 24px 24px',
                  overflow: 'auto',
                  height: '100%',
                }}
              >
                {actions}
              </div>
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
        <Splitter.Panel defaultSize={480} min={340} max={760} collapsible>
          <div
            style={{
              height: '100%',
              overflow: 'auto',
              background: token.colorBgContainer,
            }}
          >
            {inspector}
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
