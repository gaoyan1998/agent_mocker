import { contextBridge } from 'electron';

// Web UI 本身不依赖 Electron，这里只暴露一个只读标记：
// 页面将来想做「桌面版才显示」的分支时可以判断它。
// 刻意不透出 ipcRenderer —— 渲染进程加载的是本地 HTTP 服务，没必要开 IPC 面。
contextBridge.exposeInMainWorld('agentMockerDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
