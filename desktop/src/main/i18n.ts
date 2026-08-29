import { app } from 'electron';

// 桌面外壳（菜单、对话框、启动页）的文案。Web UI 自己有一套 i18n，
// 这里只覆盖 Electron 原生 UI，按系统语言在中英之间切换。
const DICTS = {
  zh: {
    'menu.app': 'Agent Mocker',
    'menu.file': '文件',
    'menu.edit': '编辑',
    'menu.view': '视图',
    'menu.window': '窗口',
    'menu.help': '帮助',
    'menu.about': '关于 Agent Mocker',
    'menu.copyBaseUrl': '复制 Mock API 地址',
    'menu.openInBrowser': '在浏览器中打开',
    'menu.openDataDir': '打开数据目录',
    'menu.openLogFile': '打开启动日志',
    'menu.restartServer': '重启 Mock 服务',
    'menu.reload': '重新加载',
    'menu.devTools': '开发者工具',
    'menu.resetZoom': '实际大小',
    'menu.zoomIn': '放大',
    'menu.zoomOut': '缩小',
    'menu.fullscreen': '全屏',
    'menu.minimize': '最小化',
    'menu.close': '关闭',
    'menu.quit': '退出',
    'menu.undo': '撤销',
    'menu.redo': '重做',
    'menu.cut': '剪切',
    'menu.copy': '复制',
    'menu.paste': '粘贴',
    'menu.selectAll': '全选',
    'menu.hide': '隐藏',
    'menu.hideOthers': '隐藏其他',
    'menu.unhide': '显示全部',
    'menu.services': '服务',
    'about.detail':
      'Mock API：{url}/v1\n管理 API：{url}/api\n数据目录：{dataDir}\n\nElectron {electron} · Node {node} · Chromium {chrome}',
    'dialog.ok': '好',
    'dialog.quit': '退出',
    'dialog.retry': '重试',
    'dialog.portBusy.title': '端口已被占用',
    'dialog.portBusy.message': '端口 {wanted} 被占用，已改用 {actual}。',
    'dialog.portBusy.detail':
      'Agent 需要把 base_url 指向 {url}/v1。\n想固定端口可以修改数据目录下的 settings.json。',
    'dialog.startFailed.title': 'Mock 服务启动失败',
    'error.title': 'Agent Mocker 启动失败',
    'error.hint': '可以先关掉占用端口的程序，再重试。',
    'loading.title': 'Agent Mocker',
    'loading.text': '正在启动 Mock 服务…',
  },
  en: {
    'menu.app': 'Agent Mocker',
    'menu.file': 'File',
    'menu.edit': 'Edit',
    'menu.view': 'View',
    'menu.window': 'Window',
    'menu.help': 'Help',
    'menu.about': 'About Agent Mocker',
    'menu.copyBaseUrl': 'Copy Mock API URL',
    'menu.openInBrowser': 'Open in Browser',
    'menu.openDataDir': 'Open Data Folder',
    'menu.openLogFile': 'Open Startup Log',
    'menu.restartServer': 'Restart Mock Server',
    'menu.reload': 'Reload',
    'menu.devTools': 'Developer Tools',
    'menu.resetZoom': 'Actual Size',
    'menu.zoomIn': 'Zoom In',
    'menu.zoomOut': 'Zoom Out',
    'menu.fullscreen': 'Toggle Full Screen',
    'menu.minimize': 'Minimize',
    'menu.close': 'Close',
    'menu.quit': 'Quit',
    'menu.undo': 'Undo',
    'menu.redo': 'Redo',
    'menu.cut': 'Cut',
    'menu.copy': 'Copy',
    'menu.paste': 'Paste',
    'menu.selectAll': 'Select All',
    'menu.hide': 'Hide',
    'menu.hideOthers': 'Hide Others',
    'menu.unhide': 'Show All',
    'menu.services': 'Services',
    'about.detail':
      'Mock API: {url}/v1\nManagement API: {url}/api\nData folder: {dataDir}\n\nElectron {electron} · Node {node} · Chromium {chrome}',
    'dialog.ok': 'OK',
    'dialog.quit': 'Quit',
    'dialog.retry': 'Retry',
    'dialog.portBusy.title': 'Port already in use',
    'dialog.portBusy.message': 'Port {wanted} is taken, using {actual} instead.',
    'dialog.portBusy.detail':
      'Point your agent’s base_url at {url}/v1.\nEdit settings.json in the data folder to pin a port.',
    'dialog.startFailed.title': 'Mock server failed to start',
    'error.title': 'Agent Mocker failed to start',
    'error.hint': 'Close whatever is holding the port, then try again.',
    'loading.title': 'Agent Mocker',
    'loading.text': 'Starting the mock server…',
  },
} as const;

export type Lang = keyof typeof DICTS;
type Key = keyof (typeof DICTS)['zh'];

let lang: Lang | null = null;

function resolveLang(): Lang {
  if (lang) return lang;
  // app.getLocale() 在 ready 之后才准确，菜单和对话框都在 ready 之后才构建。
  lang = app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return lang;
}

export function t(key: Key, params?: Record<string, string | number>): string {
  const template: string = DICTS[resolveLang()][key] ?? DICTS.zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
